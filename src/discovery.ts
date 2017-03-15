import net = require('net');
import superagent = require('superagent');
import swarm = require('discovery-swarm');
import {SWARM_PORT, SWARM_ID_PREFIX, version, debug} from './config';
import {Scuttlebot, SSBConfig} from './scuttlebot';

// Convert to ComVer:
const localVersion = (/^(\d+\.\d+)\.\d+$/.exec(version) as RegExpExecArray)[1];

export interface PeerInfo {
  id: Buffer | string;
  host: string;
  port: string | number;
  _peername: any;
}

export interface SwarmPeer {
  listen(port: number): void;
  join(key: string, opts: any, cb: Function): void;
  on(event: 'connection', cb: (connection: net.Socket, info: PeerInfo) => void): void;
}

export interface Options {
  bot: Scuttlebot;
  config: SSBConfig;
  port?: number;
  peer?: SwarmPeer;
}

/**
 * Sets up and runs a discovery swarm peer. Either takes a peer as input in opts
 * or creates a peer from scratch.
 * @param {Options} opts
 */
export function setupDiscoveryPeer(opts: Readonly<Options>) {
  const port = opts.port || SWARM_PORT;
  const peer: SwarmPeer = opts.peer || swarm({
    maxConnections: 1000,
    utp: true,
    id: SWARM_ID_PREFIX + localVersion,
  });

  peer.listen(port);
  peer.join('ssb-discovery-swarm', {announce: true}, function () {
    debug('Joining discovery swarm under the channel "ssb-discovery-swarm"');
  });

  peer.on('connection', function (connection: net.Socket, info: PeerInfo) {
    const peerId = (info.id as Buffer).toString('ascii');
    if (peerId.indexOf(SWARM_ID_PREFIX) === 0 && info.host !== opts.config.host) {
      debug('Found discovery swarm peer %s:%s, %s', info.host, info.port, info._peername);

      const remoteVersion = peerId.split(SWARM_ID_PREFIX)[1];
      const remoteMajorVer = remoteVersion.split('.')[0];
      const localMajorVer = localVersion.split('.')[0];
      if (remoteMajorVer !== localMajorVer) {
        debug(`Ignored peer easy-ssb-pub because of mismatching versions ` +
          `${remoteVersion} (remote) and ${localVersion} (local).`);
        return;
      }

      const remoteHost = info.host;
      const invitationUrl = `http://${remoteHost}/invited/json`;
      debug(`Asking SSB peer ${invitationUrl} for an invitation...`);

      superagent(invitationUrl).end((err: any, res) => {
        if (err) {
          console.error(err);
        } else {
          opts.bot.invite.accept(res.body.invitation, (err2: any, results: any) => {
            if (err2) {
              console.error(err2);
            } else {
              debug('Successfully became "SSB friends" with remote peer ' + remoteHost);
            }
          });
        }
      });
    }
  });

  return peer;
}
