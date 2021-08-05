---
layout: post
title:  "Project Drift Job System"
description: "A job system for my hobby game."
date:   2020-08-28 12:00:00 -0500
categories: Drift
permalink: DriftJobs
---

# Story Time

A few years ago I implemented command buffers on top of Cocos2D for the SpriteBuilder project. This allowed me to push all of the OpenGL calls off into a libdispatch block. This was obviously a significant performance boost on dual core iOS devices such as the iPad 2, and allowed us to push hundreds of physics backed sprites and other effects at 60 hz. Less of a "job system" and more of a traditional main/render thread split, but it did give me a taste for parallelism.

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

A couple years later I was working on a project to do real-time drone mapping using an onboard Tegra system. In the first iteration of the project we used the drone's telemetry, a calibrated camera, and a high resolution global terrain mesh to generate a real-time preview map. So as new photos were taken, it would regenerate image tiles, compress them, and stream them back to the operator's tablet. (Unfortunately the project was cancelled, and it never ran on a real flight. :-\ ) It was however highly jobified using libdispatch, and taking full advantage of the GPU and all CPU cores to crunch through gigabytes of photos was highly satisfying. :D

![RealTimeMapping](/images/RealTimeMapping.jpg)

Since then I've made some toy engines with main/render threads in them, played with [Bikeshed](https://github.com/DanEngelbrecht/bikeshed), and tried Unity's (extremely limited) job system. Nothing was very satisfying until I read Christian Gyrling's GDC presentation called [Parallelizing the Naughty Dog Engine Using Fibers](https://www.gdcvault.com/play/1022186/Parallelizing-the-Naughty-Dog-Engine). It was so simple, and more importantly it looked _fun_ to try. Even more fascinating is the idea to do away with the main thread. Once you have a robust system to synchronize dozens of jobs into a delicate little dance, what do you need a rigid main loop for?

# Jobbing in 2020

Building Christian's job system on top of Tina was even easier than I expected, and I was so pleased with the result that I turned it into it's own [header lib](https://github.com/slembcke/Tina/blob/master/tina_jobs.h). Additionally, I added queues similar to libdispatch. If you start run loops for a certain queue on multiple threads, it's a parallel queue. If you start just one thread for a particular queue, it's a serial queue. Lastly, you can set a queue to defer to another so that when your high priority queue is empty it will start pulling jobs from the low priority queue. In [Project Drift](/ProjectDrift), I run a serial queue for IO on the main thread, a dedicated thread for the serial graphics queue, and a number of worker threads to run the rest of the jobs in parallel.

Using Tina Jobs at it's most basic looks something like this:
```c
// Create a scheduler with:
// * Capacity for up to 1024 queued jobs
// * 3 independent job queues.
// * 32 fibers with 64kb stacks.
scheduler = tina_scheduler_new(1024, 3, 32, 64*1024);

// Enqueue a job to be run.
tina_scheduler_enqueue(scheduler, "JobName", do_stuff, user_data, queue_index, group);

// Process jobs in the queue 'queue_index' on this thread.
// It will keep looping until tina_scheduler_pause() is called.
tina_scheduler_run(scheduler, queue_index, false, thread_id);

static void do_stuff(tina_job* job, void* user_data, unsigned* thread_id){
  // Do stuff here!
}
```

Another idea I got from a Twitter thread became a real killer feature: The ability to switch queues partway through a job. GPU resource loading is a perfect example: Load and decode the data on a parallel worker thread, then serialize with your command stream using the serial queue.

```c
static void load_texture(tina_job* job, void* user_data, unsigned* thread_id){
  // This will be run on the job's original queue, say a work queue.
  Image* image = load_image("some_texture.png");
  
  // Now you can explicitly switch to the graphics queue...
  tina_job_switch_queue(job, DRIFT_GFX_QUEUE);
  // ... which has a dedicated thread to run it.
  upload_texture_to_gpu(image);
}
```

# Look ma! No main loop!

After jobifying some boring stuff like resource loading, I decided to go all in and move the main loop into a job. In Christian's talk, they split their main loop into separate update and drawing jobs so they could hit their 60 hz target. However if you just want to move an existing loop into a job, it's pretty easy. Consider the prototypical game loop:

```c
void main(){
  init_game();
  
  while(running){
    input();
    update();
    draw();
  }
}
```

Functional languages sometimes use tail calls instead of looping constructs. To turn the loop into a job you can do something similar.

```c
void init_game_job(){
  // Load resounces and whatnot...
  // Then jump to the loop function.
  enqueue_job(game_loop_job);
}

void game_loop_job(){
  input();
  update();
  draw();
  
  // Schedule to run the loop again.
  enqueue_job(game_loop_job);
}
```

You can also use this as a simple trick to implement game states. To switch to a different state, just queue up a different loop and abort the current job. As a nice side effect, it made implemennting hot code reloading fairly easy too. Queue up a job to hot reload the gameplay library and abort the current loop's job. This makes it easy to ensure that no code from your library is running when it gets unloaded. 

# Tina Jobs Advantages and Disadvantages

Surely some people are rolling their eyes and muttering something about "not invented here syndrome", but that's okay. It ended up being pretty simple, reasonably fast, and I was able to implement features that bothered me about other job systems. Most importantly, it was fun. :)

Pros:
* Simple: Replaces a complicated dependency with a couple hundred lines in a header.
* Pauseable: Jobs are much easier to write if you don't need to break them up.
* Queues: Serial queues and priorities are pretty handy.
* Queue Switching: This ended up being a killer feature to serialize for graphics or IO.
* C99: Doesn't need a complicated runtime to work.

Cons:
* Invented here: A non-trivial investment of time for something I didn't really need.
* Overkill: Do you really need o job system for a 2D game? Hmm...
* Synchronization: Many to many job dependencies aren't so easy.
* Portability: Future platforms will require a smidge of new assembly code. WASM is currently impossible.
* Performance: Only has the throughput to run millions of jobs per second. ;)

Ultimately, I'm going to keep my job system around because it's just so much fun to use. :)
