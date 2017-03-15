import {createScuttlebot} from './scuttlebot';
import {createDiscoveryPeer} from './discovery';
import {createExpressApp} from './http';

const {ssbBot, ssbConf} = createScuttlebot();
createDiscoveryPeer(ssbBot, ssbConf);
createExpressApp({bot: ssbBot});
