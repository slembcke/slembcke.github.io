default: serve

update:
	bundler install

clean:
	bundler exec jekyll clean

build:
	bundler exec jekyll build --unpublished --drafts --future --baseurl /temp/blog

temp: build
	rsync -aP _site/ slembcke.net:files.slembcke.net/temp/blog/

serve:
	bundler exec jekyll server --livereload --unpublished --drafts --future

review:
	bundler exec jekyll server

publish:
	git push origin master:published
