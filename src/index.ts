import * as express from 'express';
import ssbClient = require('scuttlebot');
import minimist = require('minimist');
import ssbKeys = require('ssb-keys');
import path = require('path');
import qr = require('qr-image');
import net = require('net');
import ternaryStream = require('ternary-stream');

const PUBLIC_PORT = process.env.PORT || 80;
const EXPRESS_PORT = 8009;
const SBOT_PORT = 8008;

// Setup Express app ===========================================================
const app = express();
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.set('port', EXPRESS_PORT);
app.set('views', __dirname + '/../pages');
app.set('view engine', 'ejs');

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

let thisBotIdentity: BotIdentity | null = null;

bot.whoami((err, identity: {id: string}) => {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    thisBotIdentity = {
      id: identity.id,
      qr: qr.svgObject(identity.id) as QRSVG,
    };
    console.log('This bot\'s identity is:', identity.id);
  }
});

// Setup Express routes ========================================================
type Route = '/' | '/invited';

app.get('/' as Route, (req: express.Request, res: express.Response) => {
  function tryToRender() {
    if (thisBotIdentity) {
      res.render('index', {
        id: thisBotIdentity.id,
        qrSize: thisBotIdentity.qr.size,
        qrPath: thisBotIdentity.qr.path,
      });
    } else {
      setTimeout(tryToRender, 200);
    }
  }

  tryToRender();
});

app.get('/invited' as Route, (req: express.Request, res: express.Response) => {
  bot.invite.create(1, (err, invitation) => {
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      invitation = invitation.replace(/^[^\:]*\:\d+\:/g, `:${PUBLIC_PORT}:`);
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
  console.log('Express app is running on port', app.get('port'));
});

// Y-redirection server ========================================================
function isHTTP(data) {
  const str = data.toString('ascii');
  return /^.*HTTP[^\n]*\n/g.exec(str);
};

net.createServer(function onConnect(socket) {
  const httpConnection = net.createConnection({port: EXPRESS_PORT});
  const sbotConnection = net.createConnection({port: SBOT_PORT});

  socket
    .pipe(ternaryStream(isHTTP, httpConnection, sbotConnection))
    .pipe(socket);
}).listen(PUBLIC_PORT);
