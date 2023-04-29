import {
  AtpAgent,
  AppBskyActorProfile,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AtUri,
  BlobRef,
} from '@atproto/api'
import memoize from 'fast-memoize'

export type Like = {
  uri: string
} & (
  | {
      value: AppBskyFeedPost.Record
    }
  | {
      error: string
    }
)

export function getBlobURL(service: string, did: string, ref: BlobRef) {
  return `${service}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({
    did,
    cid: ref.ref,
  }).toString()}`
}

export async function fetchLikedPosts({
  service,
  handle,
  cursor,
}: {
  service: string
  handle: string
  cursor?: string
}): Promise<{
  likes: Like[]
  cursor?: string
}> {
  const agent = new AtpAgent({ service })
  const { data } = await agent.api.com.atproto.repo.listRecords({
    repo: handle,
    collection: 'app.bsky.feed.like',
    limit: 5,
    cursor,
  })

  const likes = await Promise.all(
    data.records.map((record) => {
      if (!AppBskyFeedLike.isRecord(record.value)) {
        return { uri: record.uri, error: `Invalid like record ${record.uri}` }
      }
      const post = record.value.subject
      const uri = new AtUri(post.uri)
      return agent.api.com.atproto.repo
        .getRecord({
          repo: uri.hostname,
          collection: uri.collection,
          rkey: uri.rkey,
          cid: post.cid,
        })
        .then(({ data: { uri, value } }) => {
          if (AppBskyFeedPost.isRecord(value)) {
            return { uri, value }
          }
          return { uri: uri, error: `Invalid post record ${uri}` }
        })
        .catch((error) => ({ uri: post.uri, error: error.message }))
    })
  )

  return {
    likes,
    cursor: data.cursor,
  }
}

export const fetchProfile = memoize(async function fetchProfile(
  service: string,
  handle: string
) {
  const agent = new AtpAgent({ service })
  const { uri, value: profile } = await agent.api.com.atproto.repo
    .getRecord({
      repo: handle,
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
    })
    .then(({ data: { uri, value } }) => {
      if (AppBskyActorProfile.isRecord(value)) {
        return { uri, value }
      }
      throw new Error(`Invalid profile record ${uri}`)
    })
    .catch(() => ({
      uri: AtUri.make(handle).toString(),
      value: {},
    }))

  handle = await agent.api.com.atproto.repo
    .describeRepo({
      repo: new AtUri(uri).hostname,
    })
    .then(({ data }) => data.handle)
    .catch(() => handle)

  return { uri, handle, profile }
})

export async function fetchPost(service: string, uri: string, cid?: string) {
  const agent = new AtpAgent({ service })
  const atUri = new AtUri(uri)

  const {
    data: { value },
  } = await agent.api.com.atproto.repo.getRecord({
    repo: atUri.hostname,
    collection: atUri.collection,
    rkey: atUri.rkey,
    cid: cid,
  })

  if (AppBskyFeedPost.isRecord(value)) {
    return value
  }
  throw new Error(`Invalid post record ${uri}`)
}
