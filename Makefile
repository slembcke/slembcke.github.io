update:
	bundler install

build: build
	bundler exec jekyll build

serve: build
	bundler exec jekyll server --incremental --livereload --unpublished --drafts

review: build
	bundler exec jekyll server

.PHONY: update build serve review
