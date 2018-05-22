.PHONY: build

build:
	npm run build

deploy:
	node_modules/.bin/s3-deploy "./build/**" --cwd "./build/" --region "eu-west-1" --bucket klukka.irdn.is

deploy-local:
	node_modules/.bin/s3-deploy "./build/**" --cwd "./build/" --region "eu-west-1" --bucket klukka.irdn.is --profile=irdn

update-deps:
	tar czvf node_modules.tar.gz node_modules

unpack-deps:
	tar zxf node_modules.tar.gz

check-master:
	./check-master.sh

all: check-master unpack-deps build deploy

windows:
	./package.sh http://klukka.irdn.is --platform windows
	zip -qyr klukka.zip Vallarklukka-win32-x64/
	aws s3 cp klukka.zip s3://klukka.irdn.is/klukka.zip --profile=irdn

platform:
	./package.sh http://klukka.irdn.is
