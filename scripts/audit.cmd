@echo off
git status
git fsck --full
git log --oneline -n 3
