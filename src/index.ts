import {createScuttlebot} from './scuttlebot';
import {createDiscoveryPeer} from './discovery';
import {createExpressApp} from './http';

const {bot, config} = createScuttlebot();
createDiscoveryPeer(bot, config);
createExpressApp(bot);
