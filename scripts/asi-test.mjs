const ctx1 = {};
const ctx2 = {};
const document = {
  getElementById: () => ({ parentElement: { insertBefore: () => {}, firstChild: null } }),
  createElement: () => ({ style: {}, innerHTML: '' }),
};

// Simulates lines 787-798 structure inside IIFE
(function () {
  [ctx1, ctx2].forEach((_, ci) => {
    const wrap = document.getElementById('x').parentElement;
    const leg = document.createElement('div');
    wrap.insertBefore(leg, wrap.firstChild);
  });
})();

(function () {
  console.log('ok');
})();
