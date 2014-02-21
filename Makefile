current_dir = $(shell pwd)
xcode_path:="$(shell xcode-select -print-path | sed s/\\/Contents\\/Developer//g)"

DEFAULT: jshint iwd iwd4

jshint:
	jshint lib

iwd: clone_iwd build_iwd export_iwd

iwd4: clone_iwd4 build_iwd4 export_iwd4

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

clone_iwd4:
	mkdir -p tmp
	rm -rf tmp/iwd4
	git clone https://github.com/facebook/instruments-without-delay.git tmp/iwd4
	cd tmp/iwd4 && git checkout 637a2fc469

build_iwd4: 
	sudo xcode-select -switch "/Applications/Xcode-6.1.app"
	cd tmp/iwd4 && ./build.sh 
	sudo xcode-select -switch $(xcode_path)

export_iwd4:
	rm -rf thirdparty/iwd4
	mkdir -p thirdparty/iwd4
	cp -R tmp/iwd/build/* thirdparty/iwd4


.PHONY: \
	DEFAULT \
	jshint \
	iwd \
	clone_iwd \
	build_iwd \
	iwd4 \
	clone_iwd4 \
	build_iwd4 

