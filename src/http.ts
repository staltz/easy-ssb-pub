import express = require('express');
import qr = require('qr-image');
import {HTTP_PORT, debug} from './config';
import {Scuttlebot} from './scuttlebot';
import {Server} from 'http';
import * as Rx from 'rxjs';

interface QRSVG {
  size: number;
  path: string;
}

export interface Options {
  bot: Scuttlebot;
  port?: number;
}

function reportAndQuit(err: any) {
  console.error(err);
  process.exit(1);
}

/**
 * Sets up and runs an Express HTTP/HTML server.
 * @param {Options} opts
 */
export function setupExpressApp(opts: Readonly<Options>): Server {
  const port = opts.port || HTTP_PORT;

  const app = express();
  app.use(express.static(__dirname + '/public'));
  app.use(require('body-parser').urlencoded({ extended: true }));
  app.set('port', port);
  app.set('views', __dirname + '/../pages');
  app.set('view engine', 'ejs');

  type Route = '/' | '/invited' | '/invited/json';

  const idQR: QRSVG = qr.svgObject(opts.bot.id);
  const createInvite = Rx.Observable.bindNodeCallback<string>(opts.bot.invite.create);
  const oneInvite$ = createInvite(1);

  app.get('/' as Route, (req: express.Request, res: express.Response) => {
    res.render('index', {
      id: opts.bot.id,
      qrSize: idQR.size,
      qrPath: idQR.path,
    });
  });

  app.get('/invited' as Route, (req: express.Request, res: express.Response) => {
    oneInvite$.subscribe({
      next: (invitation: string) => {
        const qrCode = qr.svgObject(invitation) as QRSVG;
        res.render('invited', {
          invitation: invitation,
          qrSize: qrCode.size,
          qrPath: qrCode.path,
        });
      },
      error: reportAndQuit,
    });
  });

  app.get('/invited/json' as Route, (req: express.Request, res: express.Response) => {
    oneInvite$.subscribe({
      next: (invitation: string) => {
        res.json({invitation: invitation});
      },
      error: reportAndQuit,
    });
  });

  return app.listen(app.get('port'), () => {
    debug('Express app is running on port %s', app.get('port'));
  });
}