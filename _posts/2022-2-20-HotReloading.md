---
layout: post
title: "Easy Hot-Loading for C"
description: "Hot-Loading isn't just for dynamic languages. It's pretty easy to do with plain C too. Find out how."
date: 2022-02-20
permalink: HotLoadC
---

So I recently bought the hottest new computer game, [Horizon Zero Forbidden Number](https://github.com/slembcke/HotReloadingInC), and I'm really excited to play it for the first time. Here we go!

```
Try and guess the forbidden number if you dare.
Guess the number (0-9): 5
You guessed the number 5, which is too low.
Guess the number (0-9): 9
You guessed the number 9, which is too high.
Guess the number (0-9): 7
That number is forbidden. Enjoy your doom!
Please change the hardcoded number in the code and recompile to play again.
Press nearly any key to quit.
```

What!? I was _so_ excited for this game, and while the gameplay was great, the ending leaves a lot to be desired. Fortunately, it ships with full source code. Lets take a look:

```c
static const int number = 7;

int main(void){
  initscr();
  
  printw("Try and guess the forbidden number if you dare.\n");
  while(1){
    printw("Guess the number (0-9): ");
    refresh();
    
    int c = getch(); printw("\n");
    unsigned n = c - '0';
    
    if(n == number){
      printw("That number is forbidden. Enjoy your doom!\n");
      printw("Please change the hardcoded number in the code and recompile to play again.\n");
      printw("Press nearly any key to quit.\n");
      
      getch();
      return EXIT_SUCCESS;
    } else if(n <= 9){
      const char* hi_lo = (n < number ? "too low" : "too high");
      printw("You guessed the number %d, which is %s.\n", n, hi_lo);
    } else {
      printw("Is that a number? Please concentrate and try again.\n");
    }
  }
  
  return EXIT_SUCCESS;
}
```

This is 2022, how many games can you think of that require the player to restart to recompile? I'm not going to say the devs were lazy, but surely corners were cut.

## Hot-loading

Jokes aside, what we really want to do is _code hot-loading_. Basically, it's a way to pause your program, reload the code, and continue running right where it left off with the new code. If it sounds a little magical, it's because it is! In the game I'm working on right now, I have a button on my gamepad that recompiles my code, shaders, and assets then reloads them all. At ~100 ms, it happens so quickly I made it flash a notification on the screen so I knew I actually triggered it. Overall, it's very satisfying to be able to tweak constants or even whole functions and see the results in basically real time. :D

Hot-loading in dynamic languages is somewhat common, but seems to be less common in languages with a separate compile phase. I think that is mostly due to the obvious nature of how to do hotloading in dynamic languages. There isn't really even a difference between loading a file when the program starts, and doing it later. Dynamically loading libraries in static languages is very different, less common, and less convenient. Recently I gave hotloading a try again and came up with a really simple way to structure it to make it _super_ easy though. Hopefully I can convince you to give it a try by the time you finish reading this article. :)

## Dynamic Libraries

The key technology that makes this possible is dynamic libraries. Normally they are used by your OS to share common code and static data that programs need. The idea is that they save RAM and disk space. (Don't @ me, I'm aware that people have controversial takes on this. :p)

Normally a program is linked against a library when it's built and the OS can load and set them up as the executable loads, but you can also load them by name after the program starts. This is how many programs implement plugins for example. A common use case in games in OpenGL. You don't know which version of OpenGL a player's system will provide, or if it supports extensions you want to use. So you have to dynamically load the OpenGL library, lookup the functions you want to use, and store them in dozens of function pointers. While flexible, it's also very... tedious. There are libraries whose only function is to make the annoyance go away. I had avoided hotloading in C for years because I just expected it to be a similar mess. Fortunately I was wrong!

To be clear, this article is only concerned with C, and not C++. It's possible to do hot-loading in C++, but I remember there being a bunch of extra gotchas due to hidden data references. For better or worse, dynamic libraries are an _OS_ feature, not a _language_ feature.

## Simple Hot-Loading in C

My first thought about how to do hotloading in C was to make some complicated plugin-like system. It was pretty terrible, and after pondering for a bit I realized that all I really wanted to do was to push the entire game into a single dynamic library with a single entry point. This was much, much simpler. Let's dive straight into the code for the "host" executable. I'm using `dlopen()` which is the interface to dynamic libraries on UNIXes, but the code is basically identical on Windows. More on that later.

```c
// This is where dlopen() and friends came from on UNIX OSes.
#include <dlfcn.h>

typedef void* module_main_func(void* data);

int main(void){
  void* state = NULL;
  
  while(true){
    // Optional step: Run a command to recompile your library.
    // You can also just build in your IDE, then trigger a hot-load.
    // Making it a single button press is nice though.
    system("run_build_script --for my_module.so");
    
    // Load the library, and look up the module_main() function pointer.
    void* module = dlopen("my_module.so", RTLD_NOW);
    module_main_func* module_main = dlsym(module, "module_main");
    
    // Run the module's code, and save a reference to it's heap data.
    state = module_main(state);
    
    // Get ready to hot-load the module again by first closing the library.
    dlclose(module);
  }
  
  // Never actually gets here, use exit() to quit the program instead.
  return EXIT_SUCCESS;
}
```

Check out the [full code here](https://github.com/slembcke/HotReloadingInC).

So that's not so bad, but how complicated is the implementation of `module_main()` in `my_module.so`? Well, it's pretty much the same as the original `main()` function from the beginning of the article. The only difference is that returning from `module_main()`, causes the program to recompile and restart, and `exit()` is used to quite the program instead.

One important gotcha is that all of the code and data defined by the library disappears the moment you call `dlclose()`. This means that you can't create a hot-load function, and call it from your game loop when the game loop's code itself will be reloaded. The return value on the stack would point to code that no longer exists and it would crash as soon as you return from the hot-load function. Sometimes libraries will get loaded into the same memory that they were just unloaded from and it will work... sorta... Eventually you'll run into something with a pointer to something that moved and it will crash later and mysteriously.

## Handling Compile/Link Errors

Although this is code that you'll only be running in development, you'll want to handle some of the errors. For example, if compiling your library fails, you want it to stop and give you the chance to fix the error and retry instead of just crashing. I like Visual Studio Code, and compile errors in the console log get parsed as clickable links. I find this to be "good enough" in trade for a simple button press, but for other tools you might want to just let your IDE do the compiling and then trigger the reload separately.

```c
while(system("make better-game-module.so") != 0){
  fprintf(stderr, "Whoops! Failed to compile!\n");
  fprintf(stderr, "Press return to try again.\n");
  getchar();
}
```

Link errors happen sometimes too, but you don't find out about them until the library is loaded. For instance, if you declare a function but forget to define it, the linker won't know until runtime. You can put a while loop around the `dlopen()` call to give yourself a chance to fix the problem instead of crashing. If you are running the compile step above, you might want to turn this into an `if(){...; continue}` instead so it runs the rebuild step too.

```c
void* module = dlopen("./better-game-module.so", RTLD_NOW);
while(module == NULL){
  fprintf(stderr, "Failed to load module. (%s)\n", dlerror());
  fprintf(stderr, "Press return to try again.\n");
  getchar();
}
```

The rest of the errors are all pretty specific and rare. (ex: trying to load a library or function that doesn't exist) Unless you are going to ship your game with hotloading enabled, crashing seems entirely reasonable for debug builds.

## Handling Data During Reloads

You may have noticed that so far we are just recompiling and restarting the game each time it's hot-loaded. If we stopped at this point, there would be no benefit at all compared to compiling the game as a regular executable and relaunching it every time! In order to make hot-loading useful, we need to keep the game's state, and continue where it left off.

Remember that all of a library's code and data becomes invalid when reloading. If you store pointers to any static data, globals, or functions defined in the library they will become invalid. Basically, you must to store your state in the heap. Here's a simple skeleton for a `module_main()` function.

```c
void* module_main(void* saved_state){
  MyGameState* game_state = (MyGameState*)saved_state;
  if(game_state == NULL){
    game_state = malloc(...);
    // Put code that only runs at startup here.
  } else {
    // Put code that only runs on reloads here.
  }
  
  // Put the shared start/reload code here.
  
  while(true){
    // Game loop goes here.
  }
  
  // Return the state so the hotloading loop can save it for us.
  return game_state;
}
```

If you look back to the hotloading loop, the `saved_state` pointer passed to one `module_main()` is the pointer returned from the previous one. So initially it's just `NULL` and you can check that to initialize the game data to it's starting state. When `module_main()` returns back to the hotloading loop, it passes back the pointer so it can survive in code that hasn't been reloaded. Then afterwards it passes the pointer back, which you can use to skip the game's initialization and replace any references to reloaded data or code.

My advice would be to keep the separate hot-load code path as simple as possible though. I would rather waste a little CPU time reloading something, leak memory, etc than to have bugs that only occur when using a development only feature.

### Static Data References

There are a few ways to deal with static data during reloads. I started out with a separate load/reload code path, and it was workable for a while. Although at some point it became clear that most of my references to static data were in my rendering data structures, and I was also reloading all of the graphics and shaders. For me the easier solution was to just rebuild the all of the rendering data during reloads. This only needs a single code path, and has been much simpler.

The remaining references I had were small structs, and string literals. The structs were trivial enough to just copy without downsides. The strings references I was using were all debug names, so I just copied them into fixed sized name buffers. Other alternatives could be to copy them into the heap, or treat them as "atoms" (basically a hash table of strings).

### Callback References

Callbacks can be a problem as it can be tedious or impossible to track and replace them all. Many (most?) APIs don't let you change a callback after it's been set. I figure there are two solutions in that case. The simplest is to make callbacks non-reloadable by putting them in the host executable. A more flexible solution would be to keep a translation buffer of historical callback addresses to their currently loaded address. The table can be updated using a reverse lookup (ex: `dladdr()`) before closing a library, then a regular symbol lookup after reloading. It would still require making tedious callback wrappers though, even if macro shenanigans are used. So I've never actually had to use this advice myself as (much to my suprise) my current project just hasn't needed them yet.

### Don't Bother Handling Data Changes

The biggest problem with hotloading is that when you change the structure or meaning of data, you are effectively corrupting that your program saved. For example, adding a field to an existing struct can change it's size and alignment. Now any struct or array that contains that type will also change, and the new code is just going to read and write garbage. Similarly, if you change the expected values or ranges of data, that's also not going to be happy looking at old data. This is basically the same problems you run into with serializing data, except that there is no benefit to make hotloading robust against data changes. It's a lot of extra work, and the whole point of hotloading is to save time. Just restart the executable and let it initialize new data that matches.

## What About Windows?

Hot-loading on Windows is basically the same. Instead of `dlopen()` and `dlsym()` you use `LoadLibrary()` and `GetProcAddress()`. There are a couple of gotchas though. The biggest issue is that Windows prevents modifications to files that are currently open. That means you won't be able to use your IDE to recompile a .dll until your program (and the debugger) closes it. My workaround for that is to copy the library then open the copy. Then your IDE will be free to overwrite the original. Unfortunately debugging hotloaded code is a real mess with Windows tools in my experience. I simply gave up and just do one or the other. The Our Machinery blog has some [tips](https://ourmachinery.com/post/dll-hot-reloading-in-theory-and-practice/) that might help. 

## What If I'm Using a Job System?

In my game, I use a [job system](/drift/2020/08/28/DriftJobs.html), and I don't use a traditional main thread. I put off implementing hot-loading for quite a while because I thought the job system would add a lot of complications. Once I sat down and thought about it turned out to be really easy though! When I want to hot-load, instead of scheduling the next frame, I schedule a job defined in the host executable that waits for the currently running jobs to finish, then triggers the hot-load. There's a little extra indirection involved, but it's still pretty simple.

## Get It While It's Hot!

Hopefully I've convinced people that hot-loading C code is really not hard. While it has it's limitations, I personally find hot-loading to be invaluable. It can be a useful alternative for debugging some issues in real time, and the ability to change code or data on a whim is great for iteration times. :)
