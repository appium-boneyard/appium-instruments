#!/bin/bash
set -e
if [ -n "$1" ]; then
    UPGRADE_TYPE=$1
else
    UPGRADE_TYPE=patch
fi
if [ -n "$(git status -s)" ]; then
    echo 'Error: Uncommited stuff.'
    exit 1
fi
set -x
git pull origin master
TAG=$(npm version $UPGRADE_TYPE)
echo "Upgrading to version $TAG"
git commit -a -m --allow-empty $TAG
git push --tags origin master
git push -f origin master:published
#npm publish
