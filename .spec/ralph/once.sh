#!/bin/bash

issues=$(cat .spec/issues/*.md 2>/dev/null || echo "No issues found")
commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
prompt=$(cat .spec/ralph/prompt.md)

claude -- --permission-mode acceptEdits \
  "Previous commits: $commits Issues: $issues $prompt"
