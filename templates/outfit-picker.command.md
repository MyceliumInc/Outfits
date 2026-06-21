---
description: Pick an Outfit (agent persona) to wear in this project
allowed-tools: Bash(outfit *), Bash(npx outfit *)
---

You are helping the user pick and wear an "Outfit" - a portable, enforced agent
persona managed by the `outfit` CLI.

Steps:
1. Run `outfit list --json` to get the available outfits.
2. Present them as a short numbered list (name - description).
3. Ask the user which one they want to wear (or accept one passed as $ARGUMENTS).
4. Run `outfit doctor <name>` to confirm it can be enforced here. Show any issues.
5. If it passes, run `outfit use <name>` to wear it.
6. Tell the user to reload so the new tool-world (MCP gateway) takes effect.

If $ARGUMENTS names an outfit directly, skip straight to steps 4 - 6 for it.
