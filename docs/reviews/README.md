# UI review findings

The `ui-reviewer` agent writes findings for wave gates and single-agent UI reviews in this directory.

Use one Markdown file per task:

```text
docs/reviews/<TASK>-ui.md
```

Each finding is one line in `caveman-review` format:

```text
<path or screen>:<line or state>: <severity> <problem>. <fix>.
```

Screenshots and recordings belong under `.data/reviews/`. Do not commit `.data/reviews/`; it is local evidence for the reviewer and the task owner.

Review pt-BR, English, and pseudo-locale; light, dark, and outdoor themes; 390×844, 820×1180, and 1440×900; loading, empty, error, and offline states; recovery actions; overflow; touch targets; contrast; and console errors.
