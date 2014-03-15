current_dir = $(shell pwd)
xcode_path:="$(shell xcode-select -print-path | sed s/\\/Contents\\/Developer//g)"

DEFAULT: jshint iwd

jshint:
	jshint lib

iwd: clone_iwd build_iwd export_iwd

clone_iwd:
	mkdir -p tmp
	rm -rf tmp/iwd
	git clone https://github.com/facebook/instruments-without-delay.git tmp/iwd

build_iwd:
	sudo xcode-select -switch "/Applications/Xcode-7.0.app"
	cd tmp/iwd && ./build.sh 
	sudo xcode-select -switch $(xcode_path)

export_iwd:
	rm -rf thirdparty/iwd
	mkdir -p thirdparty/iwd
	cp -R tmp/iwd/build/* thirdparty/iwd

test:
	echo 'testing'

pre_publish: jshint iwd test

.PHONY: \
	DEFAULT \
	jshint \
	iwd \
	clone_iwd \
	build_iwd \
	test \
	pre_publish
