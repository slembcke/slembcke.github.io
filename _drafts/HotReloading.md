---
layout: post
title: "Easy Hot Reloading for C/C++"
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
Please change the hardcoded number in the code and recompile to play again!
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
      return EXIT_SUCCESS;
    } else if(n <= 9){
      const char* hi_lo = (n < number ? "too low" : "too high");
      printw("You guessed the number %d, which is %s.\n", n, hi_lo);
    } else {
      printw("That was not a number. Please concentrate this time.\n");
    }
  }
  
  return EXIT_SUCCESS;
}
```

If only there was an easy way to recompile the code and reload it without having to restart the whole game...

## Hot Reloading

Jokes aside, what we really want to do is _code hot reloading_. Basically, it's a way to pause your program, reload the code, and continue running right where it left off. If it sounds a little magical, it's because it is! In the game I'm working on right now, I have a button on my gamepad that recompiles my code, shaders, and assets then reloads them all. It happens so quickly (less than 100 ms), that I had to add a notification screen to be sure I had actually triggered a reload. It's very satisfying to be able to tweak constants or even whole functions and immediately see the results. :D

While code hot reloading is more common in frameworks made in dynamic languages like JavaScript or running on VMs like Java or .NET, there isn't really a technical reason you can't do it in C or other natively compiled languages too. In fact, my goal is to make you think "What!? That's easy!" by the time you finish reading this.

## Dynamic Libraries

The key technology that makes this possible is dynamic libraries. Normally they are used by your operating system to share common code that many programs will use. This saves RAM and disk space by cutting down on duplicate code.

Another feature of dynamic libraries is that they can be loaded after a program is started, allowing you to request function pointers out of them. This is usually how plugins are implemented for example. Now consider, what if your executable was just a simple plugin runner, and your entire program (or game in my case) was a plugin. To reload the code, all you need to do is pause the program, reload the "plugin", and then unpause the program. For consistency, I'll refer to the initial executable as the _host_, and the reloadable code as the _module_.

There's a rather annoying catch that prevents the process from being trivial however. When you unload a library, all of it's code and global variables become immediately invalid. The first consequence is that you can't simply put the reloading code in the module, and you can't even just call a `reload()` function that exists in the host. Otherwise when `reload()` returns, it would try to jump back into code from the old unloaded module that no longer exists. This will crash immediately. (... or maybe not if the new module gets loaded into the same memory, but you do _not_ want to rely on this.). The second consequence is that you have to be careful about referencing global data (variables, string literals, function pointers, etc) from the module. If you store those references somewhere, you'll need to replace them with references from the newly loaded module before you can use them again. When you can, just copy the data and save yourself the trouble.

## Simple Hot Loading for C

Let's skip right to the skeleton for the host executable and pretend like we don't care about error handling yet.

```c
#include <dlfcn.h>

typedef enum {
  MODULE_EXIT,
  MODULE_RELOAD,
} ModuleStatus;

typedef ModuleStatus module_func(void);

int main(void){
  // Keep reloading the module
  while(1){
    // Optional step: Run a command to recompile your library.
    // Alternatively, just press build in your IDE instead.
    system("run_build_script --for my_module.so");
    
    // Load the library, and look up the module_main() function pointer.
    // The names are different on Microsoft platforms. More on that later.
    void* module = dlopen("my_module.so", RTLD_NOW);
    module_func* module_main = dlsym(module, "module_main");
    
    // This is where you call into the actual module code.
    // When it returns, it either requests to exit or reload.
    if(module_main() == MODULE_EXIT) break;
    
    // Get ready to reload the module by first closing the library.
    dlclose(module);
    
    // Loop around and start again. That's basically it!
  }
  
  return EXIT_SUCCESS;
}
```

So that's not so bad, but how complicated is the implementation of `module_main()` in _my_module.so_? Well, it's pretty much the same as the original `main()` function from the beginning of the article. There are two return statements, the one in the middle should return `MODULE_RELOAD`, and the one at the end should return `MODULE_EXIT`. That's it. (You can see the code [here](https://github.com/slembcke/HotReloadingInC/blob/master/better-game-module.c))

## Handling Compile/Link Errors

Although this is code that you'll only be running in development, it's a good idea to properly handle the errors here anyway. For example, if compiling your module fails, you want it to stop and give you the chance to fix the error and retry instead of crashing.

```c
while(system("make better-game-module.so") != 0){
  fprintf(stderr, "Whoops! Failed to compile!\n");
  fprintf(stderr, "Press return to try again.\n");
  getchar();
}
```

Link errors happen sometimes too, and those happen when loading the library. You can put a while loop around the `dlopen()` call to get the same benefit there. You'll need to trigger the recompile yourself though.

```c
void* module;
while((module = dlopen("./better-game-module.so", RTLD_NOW)) == NULL){
  fprintf(stderr, "Failed to load module. (%s)\n", dlerror());
  fprintf(stderr, "Press return to try again.\n");
  getchar();
}
```

As for the rest of the error handling? Meh. Unless you plan to ship your game this way, I wouldn't bother.

## Handling Data During Reloads

The rules for reloading code is easy enough: reload all of it all the time. Data is more nuanced though. When you reload a module, all of it's global variables will be reset, and any reference to it's variables, string literals, and function pointers will become invalid. Any data you want to keep across reloads (like the state of a game for instance) _must_ be stored in the heap or stored by a variable in the host executable. You can either link your module to the host directly, or pass a context pointer to the `module_main()` function. I prefer the latter, because it's simpler.

For example, in my game when I reload my module I want to keep the game's state, window, and graphics context, but reload the gameplay code, shaders, and assets. The code for the window and graphics context is managed by the host executable, so I don't need to do anything special to keep those. The game's state is stored in the heap and passed to my module through an "app context" pointer. As for the shaders and assets, I unload them before invoking the reloading, and reload them immediately when entering my `module_main()`.

As for keeping references to data stored by the module (variables, function pointers, literals), I've mostly tried to avoid the problem. Most of my references are fixed when reloading assets, and I have a couple reload helper functions to fix the rest. I don't have an ideal solution for function pointers though. What I do is keep a hash table of function pointers and use `dladdr()` to do a reverse name lookup. When running in debug mode I always use the hash table to translate a callback's address, and update the table after reloading the module. There is potential for false positives, but so far it's worked ok. Since the module reloading is only used for development, it seems adequate.

Lastly, there is one big gotcha that hot reloading can't really handle: Changes to the layout or meaning of your data. This is the same problem you have with serialization. You can't throw new code at an old data format and expect it to work. If you change your struct definitions, enumerations, or default initializations, you will have bizarre and undefined crashes when you reload your module. You could _possibly_ handle this using database-like change scripts... but why? Just restart your executable every once in a while. ;)

## What About Windows?

Hot reloading on Windows works basically the same. Instead of `dlopen()` you use `LoadLibrary()`, and instead of `dlsym()` you use `GetProcAddress()`, etc. Just need to swap out some function names.

## Reloading from a Job System

In my game, I use a [job system](/drift/2020/08/28/DriftJobs.html), and I don't really have a main thread or main loop at all. I put off implementing hot reloading for quite a while because I thought the job system would add a lot of complications. Once I sat down and thought about it turned out to be really easy though. When I want to reload, I do it at the end of a frame where I've already synchronized on all of the currently executing jobs. Since I know no other jobs are running with code from the module, I can end the current frame's job and start a new one that reloads the module and then executes `module_main()` to start the game running again.

## Get It While It's Hot!

Hopefully I've convinced people that hot reloading native compiled code is really not hard. While hot reloading has it's limits in terms of data malleability, it's a problem that's shared by all languages, and not specific to C. I personally find hot reloading to be invaluable. In many cases it can completely replace the the need for debugging UIs that allow me to change values on the fly. Instead I can just write regular code and change it on a whim. :)
