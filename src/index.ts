import {createScuttlebot} from './scuttlebot';
import {createDiscoveryPeer} from './discovery';
import {setupExpressApp} from './http';

const {ssbBot, ssbConf} = createScuttlebot();
createDiscoveryPeer(ssbBot, ssbConf);
setupExpressApp({bot: ssbBot});
