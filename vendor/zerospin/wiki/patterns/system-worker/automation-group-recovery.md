# Capture and recover automation groups

Serialize confirmed group processing and recovery through the same owner-local gate. Do not let a concurrent catch-up mark a running invocation interrupted. Keep external programs outside SQL transactions and the actor write permit.

1. Rebuild optimism from confirmed rows and unresolved saved replay operations before capturing a group's selected input.
2. Give siblings isolated copies of that same input, then run their programs concurrently.
3. Convert a program defect into that invocation's durable failure without canceling its siblings. Preserve interruption as interruption.
4. Save an output before staging it. Reuse saved output and prepared staging operations during recovery.
5. Treat a recorded staging rejection as terminal for that run. Do not prepare it again after another sibling encounters an infrastructure failure.
6. Open the next group only after every staging outcome is durable. Its captured view includes accepted pending output from earlier groups.

Use the AAVR and SAVR automation implementations and their recovery tests as the concrete examples. Do not hold a SQL transaction across an external Effect, recapture a running program's input, or reinvoke a started program without a saved result.
