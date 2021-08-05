update:
	bundler install

clean: build
	bundler exec jekyll clean

build: build
	bundler exec jekyll build

serve: build
	bundler exec jekyll server --incremental --livereload --unpublished --drafts

review: build
	bundler exec jekyll server

publish:
	git push origin master:published

.PHONY: update build serve review
