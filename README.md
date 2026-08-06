# Pop

Pop is a small, visual note board for jotting down tasks and ideas as "bubbles"
you can drag around, link together, and organize into a mind map. There's no
sign-up and no server involved — everything you create stays on your own device.

## Features

- **Quick capture** — double-click anywhere on the board to jot down a new bubble
- **Freeform linking** — drag one bubble onto another to connect them as
  parent/child, building out a mind map as you go
- **Automatic layout** — bubbles gently push apart and settle near the things
  they're linked to, so you rarely need to arrange anything by hand
- **Done list** — mark bubbles done to tuck them away, and revisit them anytime
- **Private by default** — your notes live in your browser (or, in the desktop
  version, in a file on your computer) and are never sent anywhere
- **Backups** — save a copy of your board whenever you like, and restore it later

## Getting started

You'll need [Node.js](https://nodejs.org/) installed. Then, from the project
folder:

```
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser and you're
in.

## How to use Pop

### Creating a bubble

Click the **+** button in the top-left corner, or double-click anywhere on the
empty canvas. Type a title and press **Enter** to create it, or press **Tab**
to create it and jump straight into writing a description.

### Viewing and editing a bubble

Click a bubble to expand it. While it's expanded you can edit its title and
description, mark it done, or delete it. Click anywhere else to collapse it
back down.

### Linking bubbles together

Drag a bubble and drop it on top of another one to link them — the bubble you
dropped becomes a "child" of the one underneath, shown with a line connecting
them. A child bubble's color blends with its parent's, so related ideas are
easy to spot at a glance. A bubble can have more than one parent if you link it
to multiple bubbles.

### Moving things around

You don't need to carefully arrange your board — bubbles automatically drift
apart from each other and settle near whatever they're linked to. Drag a
bubble somewhere new and everything else adjusts around it. Pan around the
board by clicking and dragging empty space, and zoom in or out with your
scroll wheel.

### Marking a bubble done

Expand a bubble and click **Mark as Done** to clear it off the board. You can
find everything you've completed later by clicking **Done List** in the
toolbar, sorted by when it was finished. From there, you can also
**Unmark as Done** to bring a bubble back.

### Deleting a bubble

Expand a bubble and click **Delete**. This removes it for good, so if you'd
like a safety net, save a backup first (see below).

## Settings

Click **Settings** in the toolbar to:

- Turn on **Show Completed** to keep done bubbles visible on the board instead
  of tucking them into the Done List
- Adjust how strongly bubbles push apart from each other and how far apart
  they like to sit
- **Save Backup** a copy of everything on your board, or **Recall Backup** to
  restore one you saved earlier

## Your data stays yours

Pop doesn't have an account system or a server storing your notes — everything
lives locally, in your browser or on your computer. That also means it's a
good habit to use **Save Backup** every so often, especially before clearing
your browser data or switching devices.

## License

MIT — see [LICENSE](LICENSE).
