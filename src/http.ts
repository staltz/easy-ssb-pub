import express = require('express');
import qr = require('qr-image');
import {HTTP_PORT, debug} from './config';
import {Scuttlebot} from './scuttlebot';

interface QRSVG {
  size: number;
  path: string;
}

export interface Options {
  bot: Scuttlebot;
  port?: number;
}

export function createExpressApp(opts: Readonly<Options>): express.Express {
  const port = opts.port || HTTP_PORT;

  const app = express();
  app.use(express.static(__dirname + '/public'));
  app.use(require('body-parser').urlencoded({ extended: true }));
  app.set('port', port);
  app.set('views', __dirname + '/../pages');
  app.set('view engine', 'ejs');

  type Route = '/' | '/invited' | '/invited/json';

  const idQR: QRSVG = qr.svgObject(opts.bot.id);

  app.get('/' as Route, (req: express.Request, res: express.Response) => {
    res.render('index', {
      id: opts.bot.id,
      qrSize: idQR.size,
      qrPath: idQR.path,
    });
  });

  app.get('/invited' as Route, (req: express.Request, res: express.Response) => {
    opts.bot.invite.create(1, (err: any, invitation: string) => {
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
    opts.bot.invite.create(1, (err: any, invitation: string) => {
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

  return app;
}