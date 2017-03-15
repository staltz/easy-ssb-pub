import createDebug = require('debug');

const pkg = require('../package.json');

export const debug = createDebug(pkg.name);
export const version = pkg.version;
export const HTTP_PORT = 80;
export const SBOT_PORT = 8008;
export const MAX_CONNECTED_PUBS = 3;
export const SWARM_PORT = 8007;
export const SWARM_ID_PREFIX = 'easy-ssb-pub@';