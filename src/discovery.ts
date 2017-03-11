import net = require('net');
import superagent = require('superagent');
import swarm = require('discovery-swarm');
import {SWARM_PORT, SWARM_ID_PREFIX, version, debug} from './config';
import {Scuttlebot, SSBConfig} from './scuttlebot';

// Convert to ComVer:
const localVersion = (/^(\d+\.\d+)\.\d+$/.exec(version) as RegExpExecArray)[1];

interface PeerInfo {
  id: Buffer | string;
  host: string;
  port: string | number;
  _peername: any;
}

export function createDiscoveryPeer(bot: Scuttlebot, config: SSBConfig) {
  const peer = swarm({
    maxConnections: 1000,
    utp: true,
    id: SWARM_ID_PREFIX + localVersion,
  });

  peer.listen(SWARM_PORT);
  peer.join('ssb-discovery-swarm', {announce: true}, function () {
    debug('Joining discovery swarm under the channel "ssb-discovery-swarm"');
  });

  peer.on('connection', function (connection: net.Socket, _info: PeerInfo) {
    const info = _info;
    info.id = (_info.id as Buffer).toString('ascii');
    if (info.id.indexOf(SWARM_ID_PREFIX) === 0 && info.host && info.host !== config.host) {
      debug('Found discovery swarm peer %s:%s, %s', info.host, info.port, info._peername);

      const remoteVersion = info.id.split(SWARM_ID_PREFIX)[1];
      const remoteMajorVer = remoteVersion.split('.')[0];
      const localMajorVer = localVersion.split('.')[0];
      if (remoteMajorVer !== localMajorVer) {
        debug(`Ignored peer easy-ssb-pub because of mismatching versions` +
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
          bot.invite.accept(res.body.invitation, (err2: any, results: any) => {
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
