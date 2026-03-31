global.window = {};
global.document = {
    getElementById: () => ({ style: {}, textContent: '', innerHTML: '' }),
    querySelector: () => ({ classList: { add: ()=>{}, remove: ()=>{} }, click: ()=>{} }),
    createElement: () => ({ classList: { add: ()=>{} }, style: {}, appendChild: ()=>{} }),
};
global.localStorage = { getItem:()=>null, setItem:()=>{} };
import BrasileiraoSimulator from './manager_v2.js';
const sim = window.simulator;
sim.leagues['A'].teams[0].id = 1;
sim.career = { active: true, team: sim.leagues['A'].teams[0], budget: 5000000, currentDay: 0 };
sim.currentSerie = 'A';
console.log('Testing 3 rounds...');
for(let i=0; i<3; i++) {
  try {
      sim.simulateRound();
      if (sim.isSimulating) {
         sim.skipSimulation();
      }
  } catch(e) {
      console.error('Error on round ' + i, e);
  }
}
console.log('Done.');
