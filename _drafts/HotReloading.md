---
layout: post
title: "Easy Hot Reloading Code in C/C++"
description: "Hot reloading isn't just for dynamic languages. It's pretty easy to do with compiled languages too. Find out how."
date: 2020-01-01 12:00:00 -0500
---

So I recently bought the hottest new computer game, [GuessMyNumberPunk2077](https://github.com/slembcke/HotReloadingInC), and I'm really excited to play it for the first time. Here we go!

```
Welcome to the worst guessing game ever!
Guess my number (0-9): n
That was not a number. Please concentrate this time.
Guess my number (0-9): 0
You guessed the number 0, which is too low.
Guess my number (0-9): 9
You guessed the number 9, which is too high.
Guess my number (0-9): 7
You guessed the number!
Please change the hardcoded number in the code and recompile to play a
gain!
Press almost any key to quit!
```

What!? I was _so_ excited for this game, and while the gameplay was great, the ending leaves a lot to be desired. Fortunately, it ships with full source code. Lets take a look:

```c
static const int number = 7;

int main(void){
	initscr();
	
	printw("Welcome to the worst guessing game ever!\n");
	while(1){
		printw("Guess my number (0-9): ");
		refresh();
		
		int c = getch(); printw("\n");
		unsigned n = c - '0';
		
		if(n == number){
			printw("You guessed the number!\n");
			printw("Please change the hardcoded number in the code and recompile to play again!\n");
			printw("Press almost any key to quit!\n");
			
			getch();
			break;
		} else if(n <= 9){
			const char* hi_lo = (n < number ? "too low" : "too high");
			printw("You guessed the number %d, which is %s.\n", n, hi_lo);
		} else {
			printw("That was not a number. Please concentrate this time.\n");
		}
	}
	
	endwin();
	return EXIT_SUCCESS;
}
```

If only there was an easy way to recompile the code and reload it without having to restart the whole game...

## Hot Reloading

Jokes aside, what we really want to do is _code hot reloading_. Basically, it's a technique that pauses your program, reloads the code, and continues running right where it left off. If it sounds a little magical, it's because it is! In the game I'm working on right now, I have a button on my gamepad that recompiles my code, shaders, and assets then reloads them all. It happens so quickly (less than 100 ms), that I actually had to make it show a notification on the screen to be sure it was working most of the time. It's very satisfying to be able to tweak constants or even whole functions and immediately see the results.

While code hot reloading is more common in frameworks made in dynamic languages like JavaScript or running on VMs like Java or .NET, there isn't really a technical reason you can't do it in C or other natively compiled languages too. In fact, my goal is to make you say "What!? That's easy!" by the time you finish reading this.

## Dynamic Libraries

The key technology that makes this possible is dynamic libraries. Normally they are used by your operating system to share common code that many programs will use. This saves RAM and disk space by cutting down on duplicate code.

Another feature of dynamic libraries is that they can be loaded after a program is started, allowing you to request function pointers out of them. This is usually how plugins are implemented for example. Now consider, what if you game executable was just a simple plugin runner, and your entire game was a plugin. To reload the game code, all you need to do is pause the game, reload the game "plugin", and then unpause the game.

## Simple Hot Loading for C

## Gotchas
