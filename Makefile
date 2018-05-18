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

all: unpack-deps build deploy