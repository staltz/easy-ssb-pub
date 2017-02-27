import * as express from 'express';
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
const SWARM_PORT = 8007;
const HTTP_PORT = 80;

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

interface BotIdentity {
  id: string;
  qr: QRSVG;
}

const idQR = qr.svgObject(bot.id);

bot.address((err, addr) => {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    debug('Scuttlebot app is running on address %s', addr);
    SBOT_PORT = (/\:(\d+)\~/g.exec(addr) as any)[1];
  }
});

// Setup Discovery Swarm =======================================================
var peer = swarm({
  maxConnections: 1000,
  utp: true,
  id: 'ssb-discovery-swarm:' + bot.id,
});

peer.listen(SWARM_PORT)
peer.join('ssb-discovery-swarm', {announce: false}, function () {});

peer.on('connection', function (connection, _info) {
  const info = _info;
  info.id = info.id.toString('ascii');
  info._peername = connection._peername;
  if (info.id.indexOf('ssb-discovery-swarm:') === 0) {
    debug('Discovery swarm found peer %s:%s', info.host, info.port);
    const remotePublicKey = info.id.split('ssb-discovery-swarm:')[1];
    const addr = `${info.host}:${info.port}:${remotePublicKey}`;
    debug(`Connecting to SSB peer ${addr} found through discovery swarm`);
    bot.gossip.connect(`${info.host}:${info.port}:${remotePublicKey}`, function (err) {
      if (err) {
        console.error(err);
      } else {
        debug('Successfully connected to remote SSB peer ' + addr);
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

type Route = '/' | '/invited';

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

app.listen(app.get('port'), () => {
  debug('Express app is running on port %s', app.get('port'));
});
