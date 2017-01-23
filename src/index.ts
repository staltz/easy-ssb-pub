import * as express from 'express';
import ssbClient = require('scuttlebot');
import minimist = require('minimist');
import ssbKeys = require('ssb-keys');
import path = require('path');
import qr = require('qr-image');

// Setup Express app ===========================================================
const app = express();
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.set('port', (process.env.PORT || 3000));
app.set('views', __dirname + '/../pages');
app.set('view engine', 'ejs');

// Setup Scuttlebot ============================================================
let argv = process.argv.slice(2);
const i = argv.indexOf('--');
const conf = argv.slice(i + 1);
argv = ~i ? argv.slice(0, i) : argv;

const config = require('ssb-config/inject')(process.env.ssb_appname, minimist(conf));
const keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'));
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
config.keys = keys;
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
      const qrCode = qr.svgObject(invitation) as QRSVG;
      res.render('invited', {
        invitation: invitation,
        qrSize: qrCode.size,
        qrPath: qrCode.path,
      });
    }
  })
});

app.listen(app.get('port'), () => {
  console.log('Node app is running on port', app.get('port'));
});
