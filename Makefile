.PHONY: build

build:
	npm run build

deploy:
	node_modules/.bin/s3-deploy "./build/**" --cwd "./build/" --region "eu-west-1" --bucket vikes-match.irdn.is

deploy-local:
	node_modules/.bin/s3-deploy "./build/**" --cwd "./build/" --region "eu-west-1" --bucket vikes-match.irdn.is --profile=irdn

update-deps:
	tar czvf node_modules.tar.gz node_modules

unpack-deps:
	tar zxf node_modules.tar.gz

check-master:
	./check-master.sh

all: check-master unpack-deps build deploy

windows:
	./package.sh http://vikes-match.irdn.is --platform windows
	zip -qyr klukka.zip Vallarklukka-win32-x64/
	aws s3 cp klukka.zip s3://vikes-match.irdn.is/klukka.zip --profile=irdn

platform:
	./package.sh http://vikes-match.irdn.is
