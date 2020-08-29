---
layout: post
title:  "Project Drift Job System"
date:   2020-01-01 12:00:00 -0500
categories: Drift
permalink: DriftJobs
---

I haven't had as much experience writing jobified game code as I'd like. A few years ago I implemented command buffers on top of Cocos2D for the SpriteBuilder project. This allowed me to push all of the OpenGL calls off into a libdispatch block. This was obviously a significant performance boost on dual core iOS devices such as the iPad 2, and allowed us to push hundreds of physics backed sprites and other effects at 60 hz. Really this was just main/render thread parallelism lightly implemented on a job system.

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

A couple years later I was working on a project to do real-time drone mapping using an onboard Tegra system. In the first iteration of the project we used the drone's telemetry, a calibrated camera, and a high resolution global terrain mesh to generate a real-time preview map. So as new photos were taken, it would regenerate image tiles, compress them, and stream them back to the operator's tablet. (Unfortunately the project was cancelled, and it was ran on a real flight. :-\ ) It was however highly jobified using libdispatch, and taking full advantage of the GPU and all CPU cores to crunch through gigabytes of photos was highly satisfying. :D

![RealTimeMapping](/images/RealTimeMapping.jpg)

Since then I've made some basic engines with main/render threads in them, and played with [Bikeshed](https://github.com/DanEngelbrecht/bikeshed), and Unity's (extremely limited) job system. Nothing was very satisfying until I read Christian Gyrling's GDC presentation called [Parallelizing the Naughty Dog Engine Using Fibers](https://www.gdcvault.com/play/1022186/Parallelizing-the-Naughty-Dog-Engine). It was so simple, and more importantly it looked _fun_ to implement. Even more fascinating is the idea to do away with the main thread. Once you have a robust system to synchronize dozens of little jobs into a delicate little dance, what do you need a rigid main loop for?

# Jobbing in 2020

Building Christian's job system on top of Tina was even easier than I expected, and I was so pleased with the result that I turned it into it's own [library](https://github.com/slembcke/Tina/blob/master/tina_jobs.h). Additionally, I added queues similar to libdispatch. If you start run loops for a certain queue on multiple threads, it's a parallel queue. If you start just one thread for a particular queue, it's a serial queue. Additionally, you can set a queue to defer to another so that when your high priority queue is empty it will start pulling jobs from the low priority queue. That turned out to be pretty handy. In Project Drift, I run a serial queue for IO on the main thread as well as starting a dedicated thread to run the serial graphics queue, and a number of worker threads to run the rest of the jobs.

Using Tina Jobs at it's most basic looks something like this:
```c
static void init_func(tina_job* job, void* user_data, unsigned* thread_id){
	// Do stuff here!
}

// Create a scheduler with:
// * Capacity for up to 1024 queued jobs
// * 3 independent job queues.
// * 32 fibers with 64kb stacks.
scheduler = tina_scheduler_new(1024, 3, 32, 64*1024);

// Enqueue a job to be run.
tina_scheduler_enqueue(scheduler, "DebugName", init_func, user_data, queue_index, group);

// Process jobs in the queue 'queue_index' on this thread.
// It will keep looping until tina_scheduler_pause() is called.
tina_scheduler_run(scheduler, queue_index, false, thread_id);
```

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

```c
tina_group group;
tina_group_init(&group);

uint cursor = 0;
while(cursor < job_count){
	// Schedule up to 8 jobs at once, enough to keep worker threads busy.
	cursor += tina_scheduler_enqueue_throttled(scheduler, jobs + cursor, job_count - cursor, &group, 8);
	// Wait un
	tina_job_wait(job, &group, 4);
}
```
