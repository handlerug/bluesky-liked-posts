import {
  AppBskyActorProfile,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AtUri,
  AtpAgent,
  RichText,
} from '@atproto/api'
import './App.css'
import { FormEvent, useEffect, useMemo, useState } from 'react'

type LikeResult = LikeResultSuccess | LikeResultError

interface LikeResultSuccess {
  uri: string
  value: AppBskyFeedPost.Record
}

interface LikeResultError {
  error: string
}

const agent = new AtpAgent({ service: 'https://bsky.social' })

async function loadLikes({
  handle,
  cursor,
}: {
  handle: string
  cursor?: string
}): Promise<LikeResult[]> {
  const { data } = await agent.api.com.atproto.repo.listRecords({
    repo: handle,
    collection: 'app.bsky.feed.like',
    limit: 10,
    cursor,
  })
  return await Promise.all(
    data.records.map((record) => {
      if (
        !AppBskyFeedLike.isRecord(record.value) ||
        !AppBskyFeedLike.validateRecord(record.value)
      ) {
        return { error: `Invalid like record ${record.uri}` }
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
          return { error: `Invalid post record ${uri}` }
        })
        .catch((error) => ({ error: error.message }))
    })
  )
}

const fetchProfilePromises: {
  [key: string]: Promise<{
    uri: string
    handle: string
    profile: AppBskyActorProfile.Record
  }>
  // [key: string]: Promise<
  //   | {
  //       uri: string
  //       value: AppBskyActorProfile.Record
  //     }
  //   | { error: string }
  // >
} = {}

async function fetchProfile(repo: string) {
  if (!fetchProfilePromises[repo]) {
    fetchProfilePromises[repo] = (async () => {
      const { uri, value: profile } = await agent.api.com.atproto.repo
        .getRecord({
          repo,
          collection: 'app.bsky.actor.profile',
          rkey: 'self',
        })
        .then(({ data: { uri, value } }) => {
          if (AppBskyActorProfile.isRecord(value)) {
            return { uri, value }
          }
          throw new Error(`Invalid profile record ${uri}`)
        })
      const handle = await agent.api.com.atproto.repo
        .describeRepo({
          repo: new AtUri(uri).hostname,
        })
        .then(({ data }) => data.handle)
        .catch(() => repo)
      return { uri, handle, profile }
    })()
  }
  return fetchProfilePromises[repo]
}

function FriendlyError({
  heading,
  message,
}: {
  heading: string
  message: string
}) {
  return (
    <div className="FriendlyError">
      <div>
        <b className="FriendlyError__heading">{heading}</b>
      </div>
      <span className="FriendlyError__message">{message}</span>
    </div>
  )
}

function Post({ uri, post }: { uri: string; post: AppBskyFeedPost.Record }) {
  const atUri = useMemo(() => new AtUri(uri), [uri])
  const richText = useMemo(() => {
    const rt = new RichText({
      text: post.text,
      facets: post.facets,
    })
    const nodes: (JSX.Element | string)[] = []
    let key = 0
    for (const segment of rt.segments()) {
      if (segment.isLink()) {
        nodes.push(
          <a key={key++} href={segment.link?.uri}>
            {segment.text}
          </a>
        )
      } else if (segment.isMention()) {
        nodes.push(
          <a
            key={key++}
            href={`https://staging.bsky.app/profile/${segment.mention?.did}`}
          >
            {segment.text}
          </a>
        )
      } else {
        nodes.push(segment.text)
      }
    }
    return nodes
  }, [post.text, post.facets])

  const [profile, setProfile] = useState<{
    uri: string
    handle: string
    profile: AppBskyActorProfile.Record
  } | null>(null)

  const [profileError, setProfileError] = useState<string | null>(null)

  const profileImage = useMemo(() => {
    if (!profile) {
      return null
    }

    if (!profile.profile.avatar) {
      return null
    }

    const uri = new AtUri(profile.uri)
    const query = new URLSearchParams({
      did: uri.hostname,
      cid: profile.profile.avatar.ref,
    })
    return `https://bsky.social/xrpc/com.atproto.sync.getBlob?${query.toString()}`
  }, [profile])

  useEffect(() => {
    const abortController = new AbortController()

    fetchProfile(atUri.hostname)
      .then((result) => {
        if (abortController.signal.aborted) {
          return
        }

        setProfile(result)
      })
      .catch((error) => {
        setProfileError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [atUri.hostname])

  return (
    <article className="Post">
      <header className="Post__header">
        {profileImage ? (
          <img className="Post__avatar" src={profileImage} />
        ) : (
          <div className="Post__avatar-placeholder" />
        )}
        <h1 className="Post__profile">
          <b className="Post__profile__display-name">
            {profile?.profile.displayName ?? atUri.hostname}
          </b>{' '}
          {profile ? (
            <span className="Post__profile__handle">@{profile.handle}</span>
          ) : null}
        </h1>
      </header>

      <div className="Post__content">{richText}</div>

      {profileError ? (
        <FriendlyError
          heading="Error fetching author's profile"
          message={profileError}
        />
      ) : null}
    </article>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [profileHandle, setProfileHandle] = useState('jesopo.bsky.social')
  const [validationError, setValidationError] = useState(null)
  const [error, setError] = useState(null)
  const [likes, setLikes] = useState<LikeResult[]>([])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsLoading(true)
    setError(null)

    loadLikes({ handle: profileHandle })
      .then((likes) => {
        setLikes(likes)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  return (
    <main className="max-w-l mx-auto">
      <h1 className="font-bold text-center text-3xl">
        Show posts you've liked
      </h1>

      <form onSubmit={onSubmit}>
        <div className="form-field">
          <label>
            Your profile handle
            <input
              type="text"
              name="handle"
              placeholder="jesopo.bsky.social"
              value={profileHandle}
              onChange={(ev) => setProfileHandle(ev.target.value)}
            />
          </label>
          {validationError ? <p>{validationError}</p> : null}
        </div>
      </form>

      {isLoading ? 'loading...' : ''}

      <div className="PostTimeline">
        {likes.map((like) =>
          'value' in like ? (
            <Post key={like.uri} uri={like.uri} post={like.value} />
          ) : (
            <FriendlyError
              heading="Error fetching the post"
              message={like.error}
            />
          )
        )}
      </div>
      <pre>{JSON.stringify(likes, undefined, 2)}</pre>
    </main>
  )
}

export default App
