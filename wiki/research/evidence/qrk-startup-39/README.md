# QRK 39.0.0 startup evidence

Captured on 2026-11-03 with Effect 4.0.2 and Wrangler 4.128.0. These are the
original measurements discussed in the two research notes, not fresh startup
measurements or proof that an optimization has shipped to QRK.

- [Deployment excerpt](./deployment.txt): selected verbatim output establishing
  the 709 ms result and deployed version. Binding details and unrelated output
  are omitted.
- Local report excerpts: [run 1](./startup-1.txt), [run 2](./startup-2.txt),
  [run 3](./startup-3.txt).
- Chrome CPU profiles: [run 1](./startup-1.cpuprofile),
  [run 2](./startup-2.cpuprofile), [run 3](./startup-3.cpuprofile).
- [Computed summary and hashes](./summary.json).
- [Effect API probe](./effect-api-probe.json): rechecked on 2026-11-03; the named
  span remains while its frame has no source stack. This is not a timing test.
- [Bundle source excerpts](./bundle-source-excerpts.md): the captured code at the
  profiled frame coordinates and Actor upgrade declarations.

## Provenance and limits

The profiles retain all nodes, samples, timing deltas and coordinates. Their
Worker URL is normalized to `ProductionWorker.js` to remove the author's local
checkout path. `summary.json` records original and published SHA-256 hashes.
The timing report excerpts retain their original displayed precision; the JSON
summary derives millisecond values from integer microseconds in the profiles.

The source links in the research notes pin QRK to merged SDK-upgrade commit
`bc6e079b768191d40269515524ccb2ece51f8c76`, Zerospin to `7074eaa66f27ba4966e686cdd7f3a138b10cafd2`, and Effect
to `effect@4.0.2`. The Zerospin commit contains the framework implementation used
by the locally published 39.0.0 release; the later local release commit only
changed release metadata/documentation. These pins preserve the inspected
implementation even though later changes removed its source-capture code.

The saved bundle is the prepared candidate used for local analysis, not a claim
that its complete upload metadata equals the regular deployment's metadata. Its
script coordinates match the published CPU profiles; the deployment excerpt is
separate evidence for Cloudflare's 709 ms measurement.

Profiling included QRK's uncommitted Stack-fit changes, including Actor9. Its
captured upgrade chain is preserved in the bundle excerpts, rather than linked
to a nonexistent file in the research PR. The full upload bundle, deployment
configuration and credentials are not published. Its SHA-256 is recorded for
identification. This evidence supports inspecting the measurements and
recomputing sampled attribution; it is not a complete source snapshot for
rebuilding that working-tree bundle.

## Recompute attribution

Run this from the evidence directory with Node.js; it reads existing profiles
and writes no files:

```js
const fs = require('node:fs');
// Chrome CPU-profile coordinates are zero-based; add 1 for the source excerpts.
const lines = [8515, 31207, 42985, 99846];
const runs = [1, 2, 3].map(run => {
  const profile = JSON.parse(fs.readFileSync(`startup-${run}.cpuprofile`));
  const frames = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
  const selfUs = lines.map(() => 0);
  let activeUs = 0;
  profile.samples.forEach((id, index) => {
    const frame = frames.get(id);
    const elapsedUs = profile.timeDeltas[index];
    if (frame.functionName !== '(idle)') activeUs += elapsedUs;
    if (frame.url !== 'ProductionWorker.js') return;
    const column = lines.indexOf(frame.lineNumber);
    if (column !== -1) selfUs[column] += elapsedUs;
  });
  return { activeMs: activeUs / 1000, selfMs: selfUs.map(us => us / 1000) };
});
const meanSelfMs = lines.map((_, i) =>
  runs.reduce((sum, run) => sum + run.selfMs[i], 0) / runs.length);
const meanActiveMs = runs.reduce((sum, run) => sum + run.activeMs, 0) / runs.length;
const wrapperMs = meanSelfMs.reduce((sum, ms) => sum + ms, 0);
console.log({ runs, meanSelfMs, wrapperMs, percent: 100 * wrapperMs / meanActiveMs });
```

The four frame means are 45.9, 15.2, 10.4 and 10.1 ms, totaling 81.6 ms
(approximately 31% of mean active samples). Each sample is assigned only to its
leaf frame, so this sums self time rather than repeatedly counting ancestor
frames. It includes other wrapper work and is not an isolated measurement of
Error creation or a prediction of removable Cloudflare CPU time. Apply the
same method at line 67408 for the 6.6 ms GitHub sample-generation mean.
