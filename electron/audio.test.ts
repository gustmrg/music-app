import { test } from "node:test"
import assert from "node:assert/strict"
import { AUDIO_ACCEPT, AUDIO_EXTENSION_PATTERN, AUDIO_EXTENSIONS } from "../shared/audio.ts"
import { contentTypes } from "./audio.ts"

test("shared audio extensions stay in sync with audio protocol content types", () => {
  for (const extension of AUDIO_EXTENSIONS) {
    assert.ok(AUDIO_EXTENSION_PATTERN.test(`track.${extension.toUpperCase()}`), extension)
    assert.ok(contentTypes[`.${extension}`], `missing content type for .${extension}`)
  }
  assert.equal(AUDIO_EXTENSION_PATTERN.test("cover.jpg"), false)
  assert.deepEqual(AUDIO_ACCEPT.split(","), AUDIO_EXTENSIONS.map((ext) => `.${ext}`))
})
