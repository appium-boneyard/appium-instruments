current_dir = $(shell pwd)
xcode_path:="$(shell xcode-select -print-path | sed s/\\/Contents\\/Developer//g)"
JSHINT_BIN=./node_modules/.bin/jshint
JSCS_BIN=./node_modules/.bin/jscs

DEFAULT: jshint jscs

jshint:
	@$(JSHINT_BIN) lib test

jscs:
	@$(JSCS_BIN) lib test

iwd: clone_iwd build_iwd export_iwd

authorize:
	sudo DevToolsSecurity --enable
	sudo security authorizationdb write system.privilege.taskport is-developer
	sudo chown -R `whoami`: `xcode-select -print-path`/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator*.sdk/Applications

clone_iwd:
	mkdir -p tmp
	rm -rf tmp/iwd
	git clone https://github.com/facebook/instruments-without-delay.git tmp/iwd

build_iwd:
ifndef TRAVIS_BUILD_NUMBER
	sudo xcode-select -switch "/Applications/Xcode-7.1.app"
endif
	cd tmp/iwd && ./build.sh 
	sudo xcode-select -switch $(xcode_path)

export_iwd:
	rm -rf thirdparty/iwd
	mkdir -p thirdparty/iwd
	cp -R tmp/iwd/build/* thirdparty/iwd

test: test_unit test_functional 

test_unit:
	./node_modules/.bin/mocha --recursive test/unit

test_functional:
	./node_modules/.bin/mocha --recursive test/functional

print_env:
	@echo OS X version: `sw_vers -productVersion`
	@echo Xcode version: `xcodebuild build -version`
	@echo Xcode path: `xcode-select -print-path`
	@echo Node.js version: `node -v`

travis: 
ifeq ($(CI_CONFIG),unit)
	make jshint jscs print_env test_unit
else ifeq ($(CI_CONFIG),functional)
	make jshint jscs print_env authorize iwd test_functional
endif

prepublish: jshint jscs iwd test

clean_trace:
	rm -rf instrumentscli*.trace

.PHONY: \
	DEFAULT \
	jshint \
	jscs \	
	iwd \
	clone_iwd \
	build_iwd \
	test \
	authorize \
	travis \
	prepublish \
	print_env \
	clean_trace
	
