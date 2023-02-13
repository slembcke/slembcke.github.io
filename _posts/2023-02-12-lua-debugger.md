---
layout: post
title: "Writing a Simple Lua debugger."
description: "A walkthrough of how debugger.lua works, and how I was able to keep it simple."
date: 2023-2-12
permalink: DebuggerLua
---

## Why Lua?

I've always had a bit of a soft spot for Lua. I like simple languages, and Lua exists in this interesting space between something like Scheme which I might argue is _too_ simple, and something like Python where I just don't use it often enough to remember all of it's quirks. Lua does have some of it's own, like how indexes start at 1, but overall it's a language that you can understand in a [single sitting](https://www.lua.org/manual/5.3/). It's also reasonably fast for an interpreted language, is designed from the start to be embedded in a larger program, and even comes with some fancier features like coroutines.

One of the things I didn't enjoy about Lua was it's lack of tooling. It comes with a linter and a bytecode compiler... but that's about it. Inevitably if a program is written, then it will have bugs, and you're going to need to debug those somehow. The [Lua Users wiki](https://lua-users.org/wiki/DebuggingLuaCode) does have a list of debuggers, but they pretty much all had a lot of heavy requirements. Some required socket libraries, a mix of native and lua code, or were deeply tied to another tool. All I really wanted or needed was... a single debugger.lua file I could include. When a bug occurs, just break into a simple interface and let the user poke around a bit. Lua has some functionality built in for debugging, and it sounded kinda fun to [write my own](https://github.com/slembcke/debugger.lua). After using it in my own embedded lua code, I realized how handy it would be to be able to invoke it directly from C code as well so I made a simple drop in .c/.h pair. (It's so tiny I'm considering just going full header-only)

In general, I tend to gravitate towards simple libraries that are understandable and hackable rather than massive ones that try to cover every use case. It's not always the case, but I often just find that big libraries try so hard to cover all the uncommon use cases, that they forget to make the common ones simple. It's kinda why I like Lua, and why I wrote debugger.lua. I know I've already lost a few readers by now if they realized it's a command line debugger. That's okay I guess. I don't have to solve every problem for every person to make a  tool that's useful. If you're reading this article to learn how to make a lua debugger, maybe you'll make the next great debugger anyway. At ~600 lines of code, debugger.lua is less text than this article! Hopefully it's simplicity means you can hack it, and mold it into something you find even more useful.

# Debugger.lua

Let's say I wrote this buggy bit of code to compute fibonacci numbers:

```lua
function fibonacci(n)
  assert(n > 0, "n must be positive")
  if n == 1 then
    return 1
  else
    return fibonacci(n - 1) + fibonacci(n - 2)
  end
end

fibonnacci(3)
```

If you run this, you'll get a stack trace which is kinda useful, but it's not going to tell you much that you didn't already know. Instead, I can  use `dbg.call()` to wrap part or all of the program. I works just like Lua's `pcall()`, but breaks in the debugger before returning. Instead, I get a debugger prompt, and can get a trace `t`, move up/down the stack `u/d`, list locals `l`, and show where you are in the code `w`.

```
dbg = require 'debugger'
dbg.call(fibonacci, 3)
```

<pre style="background-color:#222; color:#DDD;">
<font color="#C4A000">debugger.lua: </font>Loaded for Lua 5.3
<font color="#EF2929">ERROR: </font>&quot;fib.lua:4: n must be positive&quot;
<font color="#C4A000">break via </font><font color="#EF2929">dbg.call()</font><font color="#8AE234"> =&gt; </font><font color="#729FCF">fib.lua</font>:<font color="#C4A000">4</font> in global &apos;<font color="#729FCF">fibonacci</font>&apos;
<font color="#EF2929">debugger.lua&gt; </font>t
Inspecting frame 0
<font color="#555753">   0</font><font color="#8AE234"> =&gt; </font><font color="#729FCF">fib.lua</font>:<font color="#C4A000">4</font> in global &apos;<font color="#729FCF">fibonacci</font>&apos;
<font color="#555753">   1</font>    <font color="#729FCF">fib.lua</font>:<font color="#C4A000">8</font> in global &apos;<font color="#729FCF">fibonacci</font>&apos;
<font color="#555753">   2</font>    <font color="#729FCF">fib.lua</font>:<font color="#C4A000">8</font> in chunk at <font color="#729FCF">fib.lua</font>:<font color="#C4A000">3</font>
<font color="#555753">   3</font>    <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font> in global &apos;<font color="#729FCF">xpcall</font>&apos;
<font color="#555753">   4</font>    <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">548</font> in field &apos;<font color="#729FCF">call</font>&apos;
<font color="#555753">   5</font>    <font color="#729FCF">fib.lua</font>:<font color="#C4A000">12</font> in chunk at <font color="#729FCF">fib.lua</font>:<font color="#C4A000">0</font>
<font color="#555753">   6</font>    <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font> in chunk at <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font>
<font color="#EF2929">debugger.lua&gt; </font>d
Inspecting frame: <font color="#729FCF">fib.lua</font>:<font color="#C4A000">8</font> in global &apos;<font color="#729FCF">fibonacci</font>&apos;
<font color="#EF2929">debugger.lua&gt; </font>l
  <font color="#729FCF">n</font><font color="#8AE234"> =&gt; </font>2
<font color="#EF2929">debugger.lua&gt; </font>w 2
<font color="#555753">   6    </font>    <font color="#555753">return 1</font>
<font color="#555753">   7    </font>  <font color="#555753">else</font>
<font color="#555753">   8</font><font color="#8AE234"> =&gt; </font>    return fibonacci(n - 1) + fibonacci(n - 2)
<font color="#555753">   9    </font>  <font color="#555753">end</font>
<font color="#555753">  10    end</font>
</pre>

People either use debuggers or not, but I find that way easier to deal with. The coloring makes it easier to parse the traces, and I can actually inspect the program's state where it was broken! Also, I know it's a cardinal sin to use single letter commands... but there's only like a dozen. Here's the full list to get a better idea of debugger.lua's scope:

<pre style="background-color:#222; color:#DDD;">
<font color="#729FCF">  &lt;return&gt;</font><font color="#8AE234"> =&gt; </font>re-run last command
<font color="#729FCF">  c</font><font color="#C4A000">(ontinue)</font><font color="#8AE234"> =&gt; </font>continue execution
<font color="#729FCF">  s</font><font color="#C4A000">(tep)</font><font color="#8AE234"> =&gt; </font>step forward by one line (into functions)
<font color="#729FCF">  n</font><font color="#C4A000">(ext)</font><font color="#8AE234"> =&gt; </font>step forward by one line (skipping over functions)
<font color="#729FCF">  f</font><font color="#C4A000">(inish)</font><font color="#8AE234"> =&gt; </font>step forward until exiting the current function
<font color="#729FCF">  u</font><font color="#C4A000">(p)</font><font color="#8AE234"> =&gt; </font>move up the stack by one frame
<font color="#729FCF">  d</font><font color="#C4A000">(own)</font><font color="#8AE234"> =&gt; </font>move down the stack by one frame
<font color="#729FCF">  w</font><font color="#C4A000">(here) </font><font color="#729FCF">[line count]</font><font color="#8AE234"> =&gt; </font>print source code around the current line
<font color="#729FCF">  e</font><font color="#C4A000">(val) </font><font color="#729FCF">[statement]</font><font color="#8AE234"> =&gt; </font>execute the statement
<font color="#729FCF">  p</font><font color="#C4A000">(rint) </font><font color="#729FCF">[expression]</font><font color="#8AE234"> =&gt; </font>execute the expression and print the result
<font color="#729FCF">  t</font><font color="#C4A000">(race)</font><font color="#8AE234"> =&gt; </font>print the stack trace
<font color="#729FCF">  l</font><font color="#C4A000">(ocals)</font><font color="#8AE234"> =&gt; </font>print the function arguments, locals and upvalues.
<font color="#729FCF">  h</font><font color="#C4A000">(elp)</font><font color="#8AE234"> =&gt; </font>print this message
<font color="#729FCF">  q</font><font color="#C4A000">(uit)</font><font color="#8AE234"> =&gt; </font>halt execution
</pre>

## How does it work?

One of the reasons I bothered to write debugger.lua, is that Lua already contains a lot of the functionality you need to write a debugger. It's not really "batteries included", but you get a lot for free. For instance, there is a [debug library](https://www.lua.org/manual/5.3/manual.html#6.10) built right into the language. It has functions for getting stack traces, listing variables, etc. It even has a `debug.debug()` function that "enters an interactive mode" so it sounds like we are already done! Unfortunately, it's a REPL minus the "Print" part, and it can only access global variables. So things like printing stack traces, or inspecting local variables is _extremely_ tedious and error prone as you need to know the stack frame and variable you want to inspect _by index_. Err... We can do better!

```
lua_debug> print(debug.getlocal(4, 1))
n	0
```

While difficult to use directly from `debug.debug()`, the debug library functions are pretty complete and great for writting a pure Lua debugger without dependencies. I don't mind GDB, so initially I had a vague idea to make something like that, but the plan quickly fell apart. Perhaps the biggest issue was that it was supposed to work with embedded Lua code where the host application, and not the debugger, controls the program flow. I was going to have to make something different.

debugger.lua is just returns a regular Lua module, so you can load it in a pretty standard way like `dbg = require 'debugger'`. I almost always assign it to a "dbg" global so I'll refer to the module via that name for the rest of the article for consistency.

# Debug Hooks

_Note: Starting with debug hooks is a bit like jumping directly into the fire, but pretty much everything else builds from them. Give this section a skim now, and feel free to come back later if it doesn't make sense just yet._

Lua's [debug.sethook()](https://www.lua.org/manual/5.3/manual.html#pdf-debug.sethook) function lets you set a global callback every time the interpreter moves to a new bytecode instruction, steps to a new line of code, calls a function, or returns from a function. This is extremely powerful, letting you implement breakpoints, and all the stepping behaviour you might need. The hooks hooks also leave the stack intact so you inspect variables and such using other debug library functions.

After a bunch of iteration, I found that I [only needed 3 hooks](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L119). One to step in, out of, and over functions. The implementation for them is even shared. They all fire for each line and track the change in stack depth to see if they should trigger. There's also a bit in there to skip stepping into code that doesn't have line information. This includes functions implemented in C, or bytecode compiled without debug information.

# Entering the debugger.

Debug hooks are neat, but they are also _super_ slow. Even a short/simple hook will slow your program down by a factor of ~100x. Lua is fast for a scripting language, but not _that_ fast. This led to my first real design decision, no breakpoints. They kinda suck in command line debuggers anyway. I like GDB well enough, but setting new breakpoints is easily the most tedious and common use case.

As a replacement, I implemented a function the user can call to enter the debugger REPL directly. It's not as convenient as an IDE integrated breakpoint feature, but it works ok in my opinion. I ended up using it so much that I just made it so that you could call the debugger object directly to invoke it. You can find the code [here](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L497). Here's a simple example:

```lua
dbg = require 'dbg'

-- This will run at normal speed since there is no debug hook set yet.
some_code()

dbg()
even_more("code") -- The REPL will execute as if it's on this line
```

That last comment is an important detail. Calling the debugger function doesn't actually start the REPL directly. Instead it registers a hook function that steps out of the `dbg()` function, and then the hook starts the REPL. In fact the only place I enter the REPL from is from the hook functions. It's a small detail, but if you don't do this then the user will need to step out of the function themselves every time. Very tedious.

# Conditional "Breakpoints"

I use conditional breakpoints all the time in other debuggers. So an easy extension was to pass an optional boolean and only trigger the REPL if it's true. Since invoking the debugger is just a regular function, the implementation of this feature was essentially free! :)

```lua
for i = 1, 10 do
  dbg(i == 4) -- This will only trigger when i == 5
  print("i = "..i)
end
```

Lua also provides `error()` and `assert()` functions which are categorically similar. You _probably_ always want breakpoints on those so debugger.lua provides drop-in replacements via `dbg.error()` and `dbg.assert()`. Since the Lua versions are global variables, you can just overwrite them if you want to use them globally.

# Catching Errors

So we have a reasonable if imperfect substitute for breakpoints, but arguably the most important thing a debugger needs to do is catch errors so you can figure out why they happen. Unfortunately Lua doesn't have a global "error hook" like it does for the interpreter's execution, but we can do the next best thing and give the user a drop in replacement for Lua's usual error handling so it can integrate with the debugger. Realistically every embedded Lua program needs to have error handling anyway, and standalone programs can trivially wrap the entire program's execution if it doesn't otherwise handle errors.

Lua's version of the try/catch syntax is the [xpcall()](https://www.lua.org/manual/5.3/manual.html#pdf-xpcall) function, and it has an extremely handy property for making a debugger. When a crash happens in Lua inside of `xpcall()`, it leaves the stack intact and calls the error handling function right at the location of the crash. If you are already catching your errors this way, you can simply put a `dbg()` call in the error handler. One minor annoyance is that this will start the REPL in the error handler's stack frame, which is probably useless. To deal with this, `dbg()` can take a second optional argument telling it how many stack frames to skip. So you'd probably want to do something like `dbg(true, 1)` instead. There's even an elusive third optional argument as well that tells the user why the REPL was started. 

Lua's other error handling function is `pcall()` and debugger.lua provides `dbg.call()` as a drop-in replacement.

# The REPL

I won't talk too much about the REPL itself. The code is [pretty boring](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L472). Each line by the user is split into a command and an argument. The command functions all return a boolean to signify if the REPL should exit, and a new hook to pass to Lua's `debug.sethook()`. All of the stepping commands return true (step/next/finish/continue) since they need to exit the REPL to execute more program code. With the exception of continue, they all also return a hook that steps the interpreter a few times before re-entering the REPL. The continue command just runs code normally again until the REPL is explicitly restarted. All of the other command functions simply return false.

One tricky bit about implementing the REPL was tail-calls being treated differently in different interpreters (ex: Lua vs LuaJIT). Since all of Lua's debug functions operate on stack indices, and the number of stack frames the debugger makes matters. This required some odd code (ex: `return unpack({command(command_arg)})`) to forcibly disable tail calls for consistency in a couple places. This also means that the functions that implement the commands also have to be self contained and can't call an extra function that needs a stable stack index.

# Managing Stack Frames

That leads us right into tracking stack index offsets. Here's an example from the tutorial with the stack frame trimming code commented out:

<pre style="background-color:#222; color:#DDD;">
<font color="#EF2929">debugger.lua&gt; </font>t
Inspecting frame 0
<font color="#555753">   0</font><font color="#8AE234"> =&gt; </font><font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font> in field &apos;<font color="#729FCF">getinfo</font>&apos;
<font color="#555753">   1</font>    <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">373</font> in local &apos;<font color="#729FCF">command</font>&apos;
<font color="#555753">   2</font>    <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">463</font> in chunk at <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">452</font>
<font color="#555753">   3</font>    <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font> in global &apos;<font color="#729FCF">pcall</font>&apos;
<font color="#555753">   4</font>    <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">485</font> in upvalue &apos;<font color="#729FCF">repl</font>&apos;
<font color="#555753">   5</font>    <font color="#729FCF">debugger.lua</font>:<font color="#C4A000">131</font> in hook &apos;<font color="#729FCF">?</font>&apos;
<font color="#555753">   6</font>    <font color="#729FCF">tutorial.lua</font>:<font color="#C4A000">109</font> in upvalue &apos;<font color="#729FCF">func3</font>&apos;
<font color="#555753">   7</font>    <font color="#729FCF">tutorial.lua</font>:<font color="#C4A000">132</font> in global &apos;<font color="#729FCF">func4</font>&apos;
<font color="#555753">   8</font>    <font color="#729FCF">tutorial.lua</font>:<font color="#C4A000">183</font> in chunk at <font color="#729FCF">tutorial.lua</font>:<font color="#C4A000">0</font>
<font color="#555753">   9</font>    <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font> in chunk at <font color="#729FCF">[C]</font>:<font color="#C4A000">-1</font>
</pre>

The location where Lua's `debug.getinfo()` function is called is pretty deep into the debugger implementation itself. As the user, I'm only interested in seeing `func3` and below and so the debugger needs to know where it is in stack. So the first stack offset I track is a hard-coded constant of 6, the number of stack frames deep that the command functions are when they call Lua's debugger functions. debugger.lua was structured so I can share the same constant for all of the command functions.

The next stack index I track is a stack top offset. This is the second value passed to `dbg()` discussed above that represents how many extra stack frames to discard. In this example, it's just 0, but if had stopped on a `dbg.call()` or `dbg.assert()` for instance, then it would be 1.

Arguably the most interesting stack offset to track is the one the user is currently inspecting. Virtually every command uses this. It's set to the stack top offset when first entering the REPL. The up/down commands let you change it. They also skip stack frames without source info (C functions, compiled bytecode without debug info, etc), and do some bounds checking. That's about it. The step/next/finish commands also reset it to the stack top to move you back to where the code is actually executing.

Lastly, I track whether or not the user is using LuaJIT. For some reason I get an off-by-one error when setting local variables. I haven't looked into it for a while so it's possible that this is my bug due to tail calls though. Maybe the message here is that you have to be really careful writting a lua program that debugs itself when you need to refer to stack frames by index. ;)

# Stepping Code

I've basically described everything the code stepping commands do, but for clarity: The continue command simply exits the REPL so it can be triggered again later directly or through a crash. The step/next/finish commands exit the REPL too, but also set a hook function that re-enters the REPL after stepping the correct amount. That's pretty much it!

# Working with Variables

We're finally making our way to the real meat of the debugger that lets you actually view the program's variables. Internally, Lua has 4 types of variables you need to handle separately: globals, locals, upvalues, and varargs. The way I dealt with this was to build a table with all the variables indexed by name, and I used an `__index` metamethod fallback to the current function's environment table to handle global lookups. This table can then be used for both listing globals and as an environment table when executing code snippets. The code for that is [here](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L141).

At a high level, it works by first getting the values of all the upvalues using `debug.getupvalue()`. The upvalues are local variables of a parent function that a nested function references. Lua only makes upvalue references for variables you actually use in the nested function. Then it gets the values of all the local variables using `debug.getlocal()` overwritting any upvalues with the same name. It's important to do this after setting the upvalues since you can declare a local with the same name halfway through a function. Next it collects the varargs into an array and saves them, and finally sets the metamethod fallback for global variables.

The `debug.get*()` functions are a little odd in that you just keep iterating them until it returns a nil value. The simplest way I could figure to do it was with that `while true` loop with a break in the middle. I'm usually a bit averse to that sort of code, though it comes up fairly often in Lua code so... meh.

# Pretty-Printing Values

One issue I found with other debuggers is that they were way too eager to just output "table: 0x1234". Since you have to use tables for virtually everything in Lua this is not very helpful! I considered it crucial to make a nice pretty-printing implementation. My code for that is [here](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L37). I find this handy enough that I actually expose it as `dbg.pretty()` to get a pretty-printed string, and `dbg.pp()` to pretty-print an object to the output. It's pretty handy to log the value of a table.

At a high level, it's just prints tables recursively with a maximum depth value. One nice quality-of-life feature that was added was to respect tables that had a `__tostring` metamethod. Initially I had missed that I needed to use `pcall()` to wrap the `tostring()` call as otherwise it could crash the whole debugger when pretty-printing a bad object.

At this point it's pretty easy to write a command that lists out the locals. Just get the variable bindings table, sort it by variable name, and pretty-print it. Tada!

<pre style="background-color:#222; color:#DDD;">
<font color="#EF2929">debugger.lua&gt; </font>l
  <font color="#729FCF">...</font><font color="#8AE234"> =&gt; </font>{1 = &quot;vararg1&quot;, 2 = &quot;vararg2&quot;, 3 = &quot;vararg3&quot;}
  <font color="#729FCF">a</font><font color="#8AE234"> =&gt; </font>1
  <font color="#729FCF">b</font><font color="#8AE234"> =&gt; </font>&quot;two&quot;
  <font color="#729FCF">c</font><font color="#8AE234"> =&gt; </font>&quot;sea&quot;
  <font color="#729FCF">func3</font><font color="#8AE234"> =&gt; </font>function: 0x55dbfbe902f0
</pre>

# Running Code Snippets

One of the trickiest features was running code snippets. debugger.lua exposes two commands for this actually. The [print command](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L279) prints the result of an expression, while the [eval command](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L303) evaluates a statement. Both commands start by compiling the user's input [as a chunk](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L215) with the difference that the print command appends "return" to the front of it's expression to turn it into a statement. The distinction is important because you can only compile Lua _statements_ such as `return 5` or `a = 5`, but statements are not expressions so `return a = 5` is not valid Lua code. Modern Lua also requires you to set the function's environment (the variable bindings) when it's compiled. Another nice quality-of-life feature here was passing on the varargs parameters to the code snippet by `unpack()`ing them when calling the chunk.

To implement the print command, that's pretty much all you need other than some extra error handling The eval command still requires some extra steps since it can write variables. This feature can largely be attributed to [Alec Carlson](https://github.com/aleclarson). It uses a `__newindex` metamethod to intercept writes to the environment table and write them to the proper variable scope. Similar to building the variable bindings table, you have to make sure to check for a local, then an upvalue, then a global to implement the scoping correctly. The [mutate_bindings()](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L184) function otherwise looks pretty similar to building the variable bindings, but backwards. I struggled for a while to get this to work because I was trying to overthink it, when the answer was just to brute force it as usual. ;)

<pre style="background-color:#222; color:#DDD;">
<font color="#EF2929">debugger.lua&gt; </font>e var = &quot;value&quot;
<font color="#C4A000">debugger.lua</font><font color="#8AE234"> =&gt; </font>Set global variable <font color="#729FCF">var</font>
<font color="#EF2929">debugger.lua&gt; </font>p var..(1 + 1)
<font color="#729FCF">var..(1 + 1)</font><font color="#8AE234"> =&gt; </font>&quot;value2&quot;
</pre>

# Viewing Code

This was another nice quality-of-life feature from Alec. (Thanks!) I didn't actually think this was possible for various os/path reasons, but it seems to work great! It lets you print out the source code surrounding the current line you are on. The [source is here](https://github.com/slembcke/debugger.lua/blob/master/debugger.lua#L233). It builds up a cache of source files, and finds their paths from parsing the table returned by `debug.getinfo()`. You can even get the source code from runtime compiled code from Lua too! Once the source is found, it really just has to do some pretty-printing with line numbers and colors.

<pre style="background-color:#222; color:#DDD;">
<font color="#EF2929">debugger.lua&gt; </font>w
<font color="#555753">   1    dbg = require &apos;debugger&apos;</font>
<font color="#555753">   2    </font>
<font color="#555753">   3    function fibonacci(n)</font>
<font color="#555753">   4    </font>  <font color="#555753">dbg()</font>
<font color="#555753">   5</font><font color="#8AE234"> =&gt; </font>  if n &lt;= 1 then
<font color="#555753">   6    </font>    <font color="#555753">return 1</font>
<font color="#555753">   7    </font>  <font color="#555753">else</font>
<font color="#555753">   8    </font>    <font color="#555753">return fibonacci(n - 1) + fibonacci(n - 2)</font>
<font color="#555753">   9    </font>  <font color="#555753">end</font>
<font color="#555753">  10    end</font>
</pre>

# Using the debugger from C code

Lastly, Lua is meant to be an embedded language, so using the debugger directly from C code was a priority for me as well. Additionally, I wanted to provide a way to embed the lua code into the C code directly so that it wouldn't require an external files as a dependency. The code for that can be found [here](https://github.com/slembcke/debugger.lua/tree/master/embed). The API is basically just 2 functions. One to register the debugger module with Lua so you can `require()` it in the Lua code, and a drop-in replacement for `lua_pcall()` in the C API. That way you can easily make all of the Lua entry points easily wrapped so they invoke the debugger. Additionally, you can replace the input/output functions with your own in case you want to divert them somewhere other than stdin/stdout. I like to use libreadline for instance since it's just a few lines of code to get line editing and history.

# Conclusion

Hopefully that gives you some ideas to add some debugging to your Lua projects, or maybe you just want to use debugger.lua directly. Happy Computing!
