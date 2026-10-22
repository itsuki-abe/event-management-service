# Repository Instructions

- Work in a fast, iterative, vibe-coding style. Make reasonable implementation decisions and keep moving without asking about routine choices.
- Do not preserve backward compatibility unless the user explicitly requires it. Update callers to the new behavior and remove obsolete code, configuration, and compatibility layers.
- Treat these repository instructions as the default for work in this repository, ahead of conflicting general preferences where the instruction hierarchy permits.
- Build screens as content inside the shared shell (`src/components/workspace.tsx`, `src/workspace.css`) and the Workshop Commons design. Reuse its classes and icons; do not add per-page headers, extra links or panels, or UI beyond that design, and do not restyle other members' areas.
- Leave no AI-tool traces in commits, pull requests, code comments, file names, or branch names: no Co-Authored-By or "Generated with" lines and no tool-specific markers. Check the diff and `git log` before pushing.
