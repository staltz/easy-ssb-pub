import express = require('express');
import superagent = require('superagent');
import ssbClient = require('scuttlebot');
import minimist = require('minimist');
import ssbKeys = require('ssb-keys');
import path = require('path');
import qr = require('qr-image');
import net = require('net');
import swarm = require('discovery-swarm');
import ternaryStream = require('ternary-stream');
import createDebug = require('debug');

const debug = createDebug('easy-ssb-pub');

let SBOT_PORT = 8008;
const SWARM_PORT = sbotPortToSwarmPort(SBOT_PORT);
const HTTP_PORT = 4000;

function swarmPortToSbotPort(swarmPort) {
  return swarmPort + 1;
}

function sbotPortToSwarmPort(sbotPort) {
  return sbotPort - 1;
}

// Setup Scuttlebot ============================================================
let argv = process.argv.slice(2);
const i = argv.indexOf('--');
const conf = argv.slice(i + 1);
argv = ~i ? argv.slice(0, i) : argv;

const config = require('ssb-config/inject')(process.env.ssb_appname, minimist(conf));
config.keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'));
config.port = SBOT_PORT;
const createSbot = ssbClient
    .use(require('scuttlebot/plugins/plugins'))
    .use(require('scuttlebot/plugins/master'))
    .use(require('scuttlebot/plugins/gossip'))
    .use(require('scuttlebot/plugins/friends'))
    .use(require('scuttlebot/plugins/replicate'))
    .use(require('ssb-blobs'))
    .use(require('scuttlebot/plugins/invite'))
    .use(require('scuttlebot/plugins/block'))
    .use(require('scuttlebot/plugins/local'))
    .use(require('scuttlebot/plugins/logging'))
    .use(require('scuttlebot/plugins/private'));
const bot = createSbot(config);

interface QRSVG {
  size: number;
  path: string;
}

const idQR: QRSVG = qr.svgObject(bot.id);

bot.address((err, addr) => {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    debug('Scuttlebot app is running on address %s', addr);
    SBOT_PORT = parseInt((/\:(\d+)\~/g.exec(addr) as any)[1]);
  }
});

// Setup Discovery Swarm =======================================================
var peer = swarm({
  maxConnections: 1000,
  utp: true,
  id: 'ssb:' + bot.id,
});

peer.listen(SWARM_PORT)
peer.join('ssb-discovery-swarm', {announce: true}, function () {
  debug('Joining discovery swarm under the channel "ssb-discovery-swarm"');
});

peer.on('connection', function (connection, _info) {
  const info = _info;
  info.id = info.id.toString('ascii');
  if (info.id.indexOf('ssb:') === 0 && info.host && info.host !== config.host) {
    debug('Found discovery swarm peer %s:%s, %s', info.host, info.port, info._peername);

    const remoteSbotHost = info.host;
    const remoteSbotKey = info.id.split('ssb:')[1];
    const remoteSbotPort = swarmPortToSbotPort(info.port);
    const sbotAddr = `${remoteSbotHost}:${remoteSbotPort}:${remoteSbotKey}`;
    debug(`Found SSB peer ${sbotAddr} through discovery swarm`);
    const invitationUrl = `http://${remoteSbotHost}/invited/json`;
    debug(`Asking SSB peer ${invitationUrl} for an invitation...`);

    superagent(invitationUrl).end((err, res) => {
      if (err) {
        console.error(err);
      } else {
        bot.invite.accept(res.body.invitation, (err2, results) => {
          if (err2) {
            console.error(err2);
          } else {
            debug('Successfully connected to remote SSB peer ' + sbotAddr);
            debug(results);
          }
        });
      }
    });
  }
})

// Setup Express app ===========================================================
const app = express();
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.set('port', HTTP_PORT);
app.set('views', __dirname + '/../pages');
app.set('view engine', 'ejs');

type Route = '/' | '/invited' | '/invited/json';

app.get('/' as Route, (req: express.Request, res: express.Response) => {
  res.render('index', {
    id: bot.id,
    qrSize: idQR.size,
    qrPath: idQR.path,
  });
});

app.get('/invited' as Route, (req: express.Request, res: express.Response) => {
  bot.invite.create(1, (err, invitation) => {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      const qrCode = qr.svgObject(invitation) as QRSVG;
      res.render('invited', {
        invitation: invitation,
        qrSize: qrCode.size,
        qrPath: qrCode.path,
      });
    }
  });
});

app.get('/invited/json' as Route, (req: express.Request, res: express.Response) => {
  bot.invite.create(1, (err, invitation) => {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      res.json({
        invitation: invitation,
      });
    }
  });
});

app.listen(app.get('port'), () => {
  debug('Express app is running on port %s', app.get('port'));
});
