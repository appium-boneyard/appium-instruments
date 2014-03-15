#!/bin/bash
set -e
if [ -n "$1" ]; then
    UPGRADE_TYPE=$1
else
    UPGRADE_TYPE=patch
fi
if [ $(git rev-parse --abbrev-ref HEAD) -ne "master" ]; then
    echo 'Error: Not on master.'
    exit 1
fi
if [ -n "$(git status -s)" ]; then
    echo 'Error: Uncommited stuff.'
    exit 1
fi
set -x
git pull origin master
make pre_publish
git add thirdparty && git commit -a -m 'building before publishing'
TAG=$(npm version $UPGRADE_TYPE)
echo "Upgrading to version $TAG"
git commit -a --allow-empty -m $TAG
git push --tags origin master
git push -f origin :published
#npm publish
