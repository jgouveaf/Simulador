import BrasileiraoSimulator from './manager_v2.js';
try {
    const sim = new BrasileiraoSimulator();
    console.log('Instantiated successfully. Copa rounds:', sim.copaDoBrasil.stages.length);
} catch (e) {
    console.error('Error instantiating simulator:', e);
}
