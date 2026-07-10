import * as R from 'ramda';
import queryString from 'querystring';
import request from './utils/request.js';
import scriptData from './utils/scriptData.js';
import { BASE_URL } from './constants.js';

const PLAYSTORE_URL = `${BASE_URL}/store/apps/details`;

/*
 * Google Play no longer exposes a single app version on the detail page for
 * anonymous requests: apps shipped as App Bundles report `null` there (the
 * page shows "Varies with device"). The real installed version lives in the
 * "Compatibility for your active devices" list (field 128), which the server
 * only sends when the request carries the login cookies of an account that has
 * registered devices. Pass those cookies through requestOptions, e.g.
 *   version({ appId, requestOptions: { headers: { cookie: '<play.google.com cookies>' } } })
 */
function version (opts) {
  return new Promise(function (resolve, reject) {
    if (!opts || !opts.appId) {
      throw Error('appId missing');
    }

    opts.lang = opts.lang || 'en';
    opts.country = opts.country || 'us';

    const qs = queryString.stringify({
      id: opts.appId,
      hl: opts.lang,
      gl: opts.country
    });
    const reqUrl = `${PLAYSTORE_URL}?${qs}`;

    const options = Object.assign({
      url: reqUrl,
      followRedirect: true
    }, opts.requestOptions);

    request(options, opts.throttle)
      .then(scriptData.parse)
      .then((parsed) => buildResult(parsed, opts.appId))
      .then(resolve)
      .catch(reject);
  });
}

/*
 * The app detail block (RPC Ws7gDc) sits at a different ds:* key depending on
 * whether the request is anonymous (ds:5) or authenticated (ds:7), so find it
 * by shape — a string title at [1,2,0,0] and a device array at [1,2,128,0] —
 * instead of a hardcoded key.
 */
function findDetailDevices (parsed) {
  for (const key of Object.keys(parsed)) {
    if (!key.startsWith('ds:')) {
      continue;
    }
    const title = R.path([key, 1, 2, 0, 0], parsed);
    const devices = R.path([key, 1, 2, 128, 0], parsed);
    if (typeof title === 'string' && Array.isArray(devices)) {
      return devices;
    }
  }
  return null;
}

function mapDevice (dev) {
  const detail = R.path([6], dev);
  return {
    device: R.path([4], dev),
    lastUsed: R.path([5], dev),
    versionCode: R.path([6, 2], dev),
    versionName: R.path([6, 3], dev),
    // Incompatible devices ("Does not work on your device") have no detail.
    compatible: detail !== null && detail !== undefined
  };
}

/* Sort version strings so the newest comes first (e.g. 12.8.3 before 12.5.2). */
function compareVersionDesc (a, b) {
  const pa = String(a).split(/[.\s(]/).map(Number);
  const pb = String(b).split(/[.\s(]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) {
      return y - x;
    }
  }
  return 0;
}

function buildResult (parsed, appId) {
  const rawDevices = findDetailDevices(parsed);
  if (!rawDevices) {
    // No device block: either anonymous request, or the logged-in account has
    // no registered devices.
    return { appId, version: null, devices: [] };
  }

  const devices = rawDevices.map(mapDevice).filter((d) => d.device);
  const versionNames = devices.map((d) => d.versionName).filter(Boolean);
  const version = versionNames.length
    ? [...new Set(versionNames)].sort(compareVersionDesc)[0]
    : null;

  return { appId, version, devices };
}

export default version;
