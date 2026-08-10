---
name: one-take-every-move
description: 'Transform raw talking-head videos into premium motion-graphics edits with kinetic camera whips and synced typography. Trigger this skill whenever the user asks to "add camera moves", "make this cinematic", "polish this video", "run one-take-every-move", or wants to turn a single take into a dynamic edit. Handles the complete workflow — recording setup guidance, /kinetic-multicam prompt generation (transcription + camera planning + super timing), and Seedance 2.0 Fast generation. Works on any video length and any language. No multi-camera setup, no editing skills, no keyframes needed.'
compatibility: Claude Code with /kinetic-multicam skill, Seedance 2.0 Fast, video input files
---

# One Take Every Move

Convert a single talking-head take into a professional motion-graphics edit: split-second camera whips that lock off, and bold kinetic supers synced to your speech. The entire workflow is automated—transcription, camera blocking, timing, and prompt generation all happen in Claude Code.

## The Workflow at a Glance

```
Record one take → /kinetic-multicam generates prompt → Seedance 2.0 Fast produces final edit
```

Your original footage stays untouched: face, room, audio, and lip-sync preserved. The AI adds only two things on top: rapid motion-blurred camera repositions (whip cuts, orbits, pulls), and kinetic typography cut from your actual spoken words.

---

## Step 1: Record Your One Take

### Setup
- **Camera**: Phone camera is fine. Laptop webcam works too.
- **Framing**: Medium shot or close-up of you talking. Keep yourself well-lit (natural window light or ring light works).
- **Environment**: Any space works—bedroom, studio, office, kitchen. The more interesting the background, the better the camera moves will feel.
- **Audio**: Record with clear audio. Phone mic is acceptable if you're in a quiet space. External mic is ideal (even a $20 lavalier).

### Recording Tips
- **Short and punchy**: Hooks work best (under 15 seconds). Longer takes (15–60 seconds) also work but benefit from being split into clear sections.
- **One take, no retakes**: Speak your line once. No need for multiple takes for coverage—the AI creates every camera angle from this single source.
- **Natural speech**: Don't over-perform. Conversational energy works better than theatrical delivery. Pauses and emphasis are good—the timing system will sync to them.
- **Stationary position**: Stay relatively still. The AI adds the camera movement; you don't need to move around.

### File Requirements
- **Format**: MP4, MOV, WebM (any common video format works)
- **Resolution**: 1080p or higher preferred, but 720p is fine
- **Framerate**: 24fps, 30fps, or 60fps all work

---

## Step 2: Generate the Prompt with /kinetic-multicam

### Install the Skill
The `/kinetic-multicam` skill is free and lives at [github.com/aipauloshimas/kinetic-multicam](https://github.com/aipauloshimas/kinetic-multicam). Install it into Claude Code by following the README in the repo.

### Run the Skill
1. Drop your video into Claude Code
2. Run `/kinetic-multicam` on your file
3. The skill will:
   - **Transcribe** your speech with word-level timestamps
   - **Split the take** into natural phrase boundaries (camera blocks)
   - **Plan camera moves** (whips, orbits, pulls, reveals)
   - **Extract supers** from your spoken words
   - **Generate the full Seedance prompt** automatically

### Approve the Plan
You'll see the plan in chat:
- Proposed camera positions for each phrase
- Which words get turned into on-screen text
- Camera transition timing
- Positioning of supers (in open frame, behind body, etc.)

Review it. Ask Claude to adjust if you want different camera moves, different text, or different timing. Then let Claude finalize the prompt.

### Your Prompt is Ready
Once approved, you'll have the complete Seedance prompt ready to paste.

---

## Step 3: Generate in Seedance 2.0 Fast

### Upload and Paste
1. Go to Seedance 2.0 Fast (via Higgsfield or direct link)
2. Upload your **original video as the source**
3. Paste the prompt from /kinetic-multicam
4. Hit generate

### What Happens
Seedance will:
- Preserve your face, room, lighting, audio, and lip-sync
- Add motion-blurred camera whips at phrase boundaries
- Layer kinetic supers timed to your speech
- Keep text out of your face (it lives in open frame areas or behind your body)

### Wait and Download
Generation takes a few minutes. When it's done, you'll have your polished video ready to post.

---

## Worked Example

Here's a single hook take run through the workflow, so you can see how the pieces line up. The speaker recorded one static phone shot in their room. `/kinetic-multicam` split the take into three camera blocks at phrase boundaries and pulled a super from the exact words spoken in each block:

| Block | Camera move | Super (from the spoken words) | Placement |
|-------|-------------|-------------------------------|-----------|
| 1 | Punch-in close-up | **"EASIEST WAY"** — lands on the whip | Open frame |
| 2 | Left orbit | **"PREMIUM EDIT"** | Layered behind the speaker's body |
| 3 | Wide room reveal | **"WITHOUT SETUP"** — as the camera pulls out | Open frame |

Notice the pattern:
- **The super is always cut from what was actually said** in that block — never invented copy. The typography reinforces the spoken beat rather than competing with it.
- **The text lands *with* the whip**, not before or after. The motion and the word hit the same frame, which is what makes it feel synced.
- **Placement stays off the face** — open frame during the wide/close shots, behind the body during the orbit. The face, hoodie, posters, mic, and lighting all stay identically preserved; only the moves and the type are added.

When you review the `/kinetic-multicam` plan, you're checking exactly these three things per block: which move, which word, and where the word sits. If any of them feels off, that's the moment to ask Claude to adjust before finalizing the prompt.

---

## What Stays the Same vs. What Changes

### Preserved (Untouched)
- Your face and expression
- Your clothing and appearance
- The room background and lighting
- Your original audio and vocal delivery
- Lip-sync fidelity

### Added (AI-Generated)
- Rapid camera repositions (visible motion-blurred whips, not cuts)
- Kinetic typography synced to spoken words
- Dynamic framing that emphasizes key phrases

### Result
Same take, same room, new energy. Looks like you had a full camera crew and an editor, but it was all one phone take.

---

## Tips for Different Content Types

### Short Hooks (Under 15 Seconds)
- **Perfect for**: TikTok clips, YouTube Shorts, Instagram Reels
- **Camera strategy**: 2-3 whips maximum (punch-in close-up, wide room reveal, etc.)
- **Supers**: 1-3 key words that land on your emphasis
- **Pacing**: Quick, punchy transitions

### Medium Talking Heads (15–60 Seconds)
- **Perfect for**: YouTube video hooks, course content, brand explainers
- **Camera strategy**: Mix orbits (left/right), pulls (push in/out), and reveals
- **Supers**: One super per major idea or emphasis point
- **Pacing**: Vary the timing—slower reveals for setup, faster whips for punches

### Long-Form Content (60+ Seconds)
- **Best practice**: Split into 2-3 shorter segments, process each separately
- **Camera strategy**: Evolve the framing over time (start tight, pull out, reveal more)
- **Supers**: One per 10-15 seconds of content
- **Why split**: Keeps the energy high and gives natural break points

### Multi-Topic Content
- If your take covers several topics, mark those boundaries in the chat with /kinetic-multicam
- The skill will split into camera blocks at those points
- Each block gets its own visual rhythm

---

## Advanced Moves

### Custom Camera Choreography
After /kinetic-multicam generates the plan, you can ask Claude to:
- Swap out specific camera moves ("make the second one a 360 orbit instead of a left/right pan")
- Adjust timing ("slow down the first whip, speed up the second")
- Reposition supers ("move that text behind his shoulder instead of open frame")
- Change which words get supers ("emphasize 'metabolic health' instead of 'simple'")

### Multi-Language Support
/kinetic-multicam works in any language. Transcription, timing, and supers all adapt. Just record and run the skill—it'll handle the rest.

### Reusing Prompts
If you like a prompt structure, you can adapt it for future videos. Ask Claude to:
- Save the prompt template
- Adjust it for new takes
- Reuse the same camera choreography with different content

---

## Troubleshooting

### "The video is too long"
Split it into multiple shorter segments. Process each with /kinetic-multicam separately, then edit together if needed.

### "The supers are covering the subject's face"
The /kinetic-multicam plan should already avoid this. If you see it in the preview, ask Claude to reposition the text to open frame areas or behind the body.

### "The camera moves feel jerky"
Adjust the transition speed in Claude's prompt (before sending to Seedance). Ask for "longer motion blur" or "smoother whip curves."

### "The transcription got a word wrong"
You can manually edit the prompt before uploading to Seedance. Just change the transcribed word in the prompt text.

### "I want more camera moves / fewer camera moves"
After the /kinetic-multicam plan, ask Claude to increase or decrease the number of whips. More moves = faster energy, fewer moves = more focus on the message.

---

## Integration with Your Brands

### Muscle Mindset
- **Content type**: Metabolic tips, coaching hooks, transformation stories
- **Ideal length**: 10–30 seconds (short and punchy)
- **Visual style**: Close-up on your face for credibility, wide reveals for room/context
- **Key phrases**: Extract your main claim ("Metabolic flexibility", "Sustainable strength", etc.) as supers

### CrayZvida
- **Content type**: AI tips, creative tutorials, trend analysis
- **Ideal length**: 15–45 seconds (educational pacing)
- **Visual style**: Close-in for emphasis, pulls to reveal context or tools
- **Key phrases**: Technical terms or conclusions work best as supers

---

## Workflow Recap

| Step | Tool | Input | Output |
|------|------|-------|--------|
| 1 | Phone/Camera | 1–60 second take | Raw MP4 or MOV |
| 2 | Claude Code + /kinetic-multicam | Video file | Approved prompt + camera plan |
| 3 | Seedance 2.0 Fast | Original video + prompt | Final polished edit |

---

## Resources

- **Skill repo**: [github.com/aipauloshimas/kinetic-multicam](https://github.com/aipauloshimas/kinetic-multicam)
- **Seedance 2.0 Fast**: [Higgsfield platform](https://higgsfield.ai) or direct link from your workspace
- **Original workflow**: "One Take Every Move" by @pauloshimas (The Creator Stack, 2026)

---

## When to Use This Skill

✅ **Use this skill when you:**
- Drop a raw video and ask to "make this cinematic" or "add camera moves"
- Mention "kinetic", "one-take", "premium edit", or "every move"
- Want to turn a single take into a dynamic, professional-looking video
- Need quick edits for Muscle Mindset or CrayZvida content
- Are creating TikToks, Shorts, or YouTube Reels from talking-head takes
- Want to avoid multi-camera setup or complex editing

❌ **Skip this skill if you:**
- Need to edit multi-camera footage (this is single-take only)
- Want to add B-roll, transitions between clips, or narrative cuts
- Need color grading, audio mixing, or other post-production work beyond motion and text
- Have a scripted scene that needs multiple setups

---

Good luck with your edits. One take. Every move. 🎬
