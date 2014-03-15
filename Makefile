current_dir = $(shell pwd)

xcode_path:="$(shell xcode-select -print-path | sed s/\\/Contents\\/Developer//g)"

DEFAULT: jshint

jshint:
	jshint lib

iwd: clone_iwd build_iwd export_iwd

authorize:
	sudo DevToolsSecurity --enable
	sudo security authorizationdb write system.privilege.taskport is-developer
	sudo chown -R `whoami`: `xcode-select --print-path`/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator*.sdk/Applications

clone_iwd:
	mkdir -p tmp
	rm -rf tmp/iwd
	git clone https://github.com/facebook/instruments-without-delay.git tmp/iwd

build_iwd:
ifndef TRAVIS_BUILD_NUMBER
	sudo xcode-select -switch "/Applications/Xcode-7.0.app"
endif
	cd tmp/iwd && ./build.sh 
	sudo xcode-select -switch $(xcode_path)

export_iwd:
	rm -rf thirdparty/iwd
	mkdir -p thirdparty/iwd
	cp -R tmp/iwd/build/* thirdparty/iwd

test: 
	./node_modules/.bin/mocha test

print_env:
	@echo OS X version: `sw_vers -productVersion`
	@echo Xcode version: `xcodebuild build -version`
	@echo Xcode path: `xcode-select --print-path`
	@echo Node.js version: `node -v`

travis: jshint print_env authorize iwd test

prepublish: jshint iwd test

.PHONY: \
	DEFAULT \
	jshint \
	iwd \
	clone_iwd \
	build_iwd \
	test \
	authorize \
	travis \
	prepublish \
	print_env
	
