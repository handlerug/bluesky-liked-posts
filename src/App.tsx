import {
  AppBskyActorProfile,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedLike,
  AppBskyFeedPost,
  AppBskyRichtextFacet,
  AtUri,
  AtpAgent,
  BlobRef,
  RichText,
} from '@atproto/api'
import './App.css'
import { FormEvent, ReactNode, memo, useEffect, useMemo, useState } from 'react'
import { default as cn } from 'classnames'

type LikeResult = LikeResultSuccess | LikeResultError

interface LikeResultSuccess {
  uri: string
  value: AppBskyFeedPost.Record
}

interface LikeResultError {
  uri: string
  error: string
}

const agent = new AtpAgent({ service: 'https://bsky.social' })

const relativeTimeFormat = new Intl.RelativeTimeFormat('en')

async function loadLikes({
  handle,
  cursor,
}: {
  handle: string
  cursor?: string
}): Promise<{
  likes: LikeResult[]
  cursor?: string
}> {
  const { data } = await agent.api.com.atproto.repo.listRecords({
    repo: handle,
    collection: 'app.bsky.feed.like',
    limit: 5,
    cursor,
  })
  return {
    likes: await Promise.all(
      data.records.map((record) => {
        if (
          !AppBskyFeedLike.isRecord(record.value) ||
          !AppBskyFeedLike.validateRecord(record.value).success
        ) {
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
            if (
              AppBskyFeedPost.isRecord(value) &&
              AppBskyFeedPost.validateRecord(value).success
            ) {
              return { uri, value }
            }
            return { uri: uri, error: `Invalid post record ${uri}` }
          })
          .catch((error) => ({ uri: post.uri, error: error.message }))
      })
    ),
    cursor: data.cursor,
  }
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
          if (
            AppBskyActorProfile.isRecord(value) &&
            AppBskyActorProfile.validateRecord(value).success
          ) {
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

async function fetchPost(uri: string, cid?: string) {
  const atUri = new AtUri(uri)
  const {
    data: { value },
  } = await agent.api.com.atproto.repo.getRecord({
    repo: atUri.hostname,
    collection: atUri.collection,
    rkey: atUri.rkey,
    cid: cid,
  })
  if (
    AppBskyFeedPost.isRecord(value) &&
    AppBskyFeedPost.validateRecord(value).success
  ) {
    return value
  }
  throw new Error(`Invalid post record ${uri}`)
}

function FriendlyError({
  className,
  heading,
  message,
}: {
  className?: string
  heading: string
  message: string
}) {
  return (
    <div className={cn('FriendlyError', className)}>
      <div>
        <b className="FriendlyError__heading">{heading}</b>
      </div>
      <span className="FriendlyError__message">{message}</span>
    </div>
  )
}

function getBlobURL(did: string, ref: BlobRef) {
  const query = new URLSearchParams({
    did,
    cid: ref.ref,
  })
  return `https://bsky.social/xrpc/com.atproto.sync.getBlob?${query.toString()}`
}

const RichTextRenderer = memo(
  ({
    text,
    facets,
  }: {
    text: string
    facets?: AppBskyRichtextFacet.Main[]
  }) => {
    const rt = new RichText({ text, facets })
    const nodes: ReactNode[] = []
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
        const runs = segment.text.split('\n')
        for (let i = 0; i < runs.length; i++) {
          if (i > 0) {
            nodes.push(<br key={key++} />)
          }
          nodes.push(runs[i])
        }
      }
    }
    return <>{nodes}</>
  }
)

function getRelativeDate(date: Date) {
  const now = new Date()
  const diff = (date.getTime() - now.getTime()) / 1000
  let relativeDate
  if (Math.abs(diff) < 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff), 'second')
  } else if (Math.abs(diff) < 60 * 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff / 60), 'minute')
  } else if (Math.abs(diff) < 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff / 60 / 60), 'hour')
  } else if (Math.abs(diff) < 30 * 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(
      Math.floor(diff / 60 / 60 / 24),
      'day'
    )
  } else if (Math.abs(diff) < 365 * 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(
      date.getMonth() - now.getMonth(),
      'month'
    )
  } else {
    relativeDate = relativeTimeFormat.format(
      date.getFullYear() - now.getFullYear(),
      'month'
    )
  }
  return relativeDate
}

function Post({ uri, post }: { uri: string; post: AppBskyFeedPost.Record }) {
  const atUri = useMemo(() => new AtUri(uri), [uri])

  const [profile, setProfile] = useState<{
    uri: string
    handle: string
    profile: AppBskyActorProfile.Record
  } | null>(null)

  const [profileError, setProfileError] = useState<string | null>(null)

  const [parentPost, setParentPost] = useState<AppBskyFeedPost.Record | null>(
    null
  )
  const [parentPostError, setParentPostError] = useState<string | null>(null)

  const profileImage = useMemo(() => {
    if (!profile) {
      return null
    }

    if (!profile.profile.avatar) {
      return null
    }

    return getBlobURL(atUri.hostname, profile.profile.avatar)
  }, [profile])

  const [date, relativeDate] = useMemo(() => {
    const date = new Date(post.createdAt)
    return [date, getRelativeDate(date)]
  }, [post.createdAt])

  useEffect(() => {
    if (!post.reply) {
      return () => {}
    }

    const abortController = new AbortController()

    fetchPost(post.reply.parent.uri, post.reply.parent.cid)
      .then((result) => {
        if (abortController.signal.aborted) {
          return
        }

        setParentPost(result)
      })
      .catch((error) => {
        setParentPostError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [post.reply?.parent.uri, post.reply?.parent.cid])

  useEffect(() => {
    const abortController = new AbortController()

    fetchProfile(atUri.hostname)
      .then((result) => {
        if (abortController.signal.aborted) {
          return
        }

        setProfile(result)
      })
      .catch(() => {
        return agent.com.atproto.repo
          .describeRepo({ repo: atUri.hostname })
          .then(({ data }) => {
            setProfile({
              uri: `at://${atUri.hostname}`,
              handle: data.handle,
              profile: {},
            })
          })
      })
      .catch((error) => {
        setProfileError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [atUri.hostname])

  const postNode = (
    <article className="Post">
      {profileImage ? (
        <img className="Post__avatar" src={profileImage} />
      ) : (
        <div className="Post__avatar-placeholder" />
      )}
      <a
        className="Post__author-name"
        href={`https://staging.bsky.app/profile/${
          profile ? profile.handle : atUri.hostname
        }`}
      >
        {profile?.profile.displayName ?? profile?.handle ?? atUri.hostname}
      </a>{' '}
      {profile ? (
        <span className="Post__author-handle">@{profile.handle}</span>
      ) : null}
      <a
        className="Post__relative-date"
        href={`https://staging.bsky.app/profile/${atUri.hostname}/post/${atUri.rkey}`}
      >
        <time
          dateTime={date.toISOString()}
          title={date.toLocaleString()}
          aria-label={`${relativeDate} — click to open the post in the Bluesky web app`}
        >
          {relativeDate}
        </time>
      </a>
      <div className="Post__content">
        <RichTextRenderer text={post.text} facets={post.facets} />
      </div>
      {post.embed ? (
        AppBskyEmbedImages.isMain(post.embed) ? (
          <PostImages did={atUri.hostname} images={post.embed.images} />
        ) : AppBskyEmbedRecordWithMedia.isMain(post.embed) ? (
          <>
            {AppBskyEmbedImages.isMain(post.embed.media) ? (
              <PostImages
                did={atUri.hostname}
                images={post.embed.media.images}
              />
            ) : null}
            <PostEmbed
              className="Post__post-embed"
              record={post.embed.record}
            />
          </>
        ) : null
      ) : null}
      {profileError ? (
        <FriendlyError
          className="Post__profile-error"
          heading="Error fetching author's profile"
          message={profileError}
        />
      ) : null}
    </article>
  )

  if (post.reply && parentPost) {
    return (
      <div className="PostThread">
        <Post
          uri={post.reply.parent.uri}
          post={{
            ...parentPost,
            reply: undefined,
          }}
        />
        {postNode}
      </div>
    )
  }

  if (post.reply && parentPostError) {
    return (
      <>
        <FriendlyError
          heading="Error fetching parent post"
          message={parentPostError}
        />
        {postNode}
      </>
    )
  }

  return postNode
}

function PostEmbed({
  className,
  record: { record },
}: {
  className?: string
  record: AppBskyEmbedRecord.Main
}) {
  const atUri = useMemo(() => new AtUri(record.uri), [record.uri])

  const [post, setPost] = useState<AppBskyFeedPost.Record | null>(null)
  const [postError, setPostError] = useState<string | null>(null)

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

    return getBlobURL(atUri.hostname, profile.profile.avatar)
  }, [profile])

  const [date, relativeDate] = useMemo(() => {
    if (!post) {
      return [new Date(), '']
    }
    const date = new Date(post.createdAt)
    return [date, getRelativeDate(date)]
  }, [post?.createdAt])

  useEffect(() => {
    const abortController = new AbortController()

    fetchPost(record.uri, record.cid)
      .then((post) => {
        if (abortController.signal.aborted) {
          return
        }
        setPost(post)
      })
      .catch((error) => {
        setPostError(error.message)
      })

    return () => {
      abortController.abort()
    }
  }, [record.uri])

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

  if (postError) {
    return (
      <FriendlyError
        className={className}
        heading="Failed to fetch the embedded post"
        message={postError}
      />
    )
  }

  if (!post) {
    return null
  }

  return (
    <div className={cn('Post', 'Post--embed', className)}>
      {profileImage ? (
        <img className="Post__avatar" src={profileImage} />
      ) : (
        <div className="Post__avatar-placeholder" />
      )}
      <a
        className="Post__author-name"
        href={`https://staging.bsky.app/profile/${
          profile ? profile.handle : atUri.hostname
        }`}
      >
        {profile?.profile.displayName ?? atUri.hostname}
      </a>{' '}
      {profile ? (
        <span className="Post__author-handle">@{profile.handle}</span>
      ) : null}
      <time
        className="Post__relative-date"
        dateTime={date.toISOString()}
        title={date.toLocaleString()}
      >
        {relativeDate}
      </time>
      <div className="Post__content">
        <RichTextRenderer text={post.text} facets={post.facets} />
      </div>
      {profileError ? (
        <FriendlyError
          className="Post__profile-error"
          heading="Error fetching author's profile"
          message={profileError}
        />
      ) : null}
      <a
        className="Post__link"
        href={`https://staging.bsky.app/profile/${atUri.hostname}/post/${atUri.rkey}`}
      >
        Open post in the Bluesky web app
      </a>
    </div>
  )
}

function PostImages({
  did,
  images,
}: {
  did: string
  images: AppBskyEmbedImages.Image[]
}) {
  if (images.length === 1) {
    return (
      <img
        className="Post__image"
        src={getBlobURL(did, images[0].image)}
        alt={images[0].alt}
      />
    )
  }

  return (
    <div className="Post__images">
      {images.map((image, idx) => (
        <img key={idx} src={getBlobURL(did, image.image)} alt={image.alt} />
      ))}
    </div>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [profileHandle, setProfileHandle] = useState('jesopo.bsky.social')
  const [error, setError] = useState(null)
  const [likes, setLikes] = useState<LikeResult[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const load = (cursor?: string) => {
    setError(null)

    return loadLikes({ handle: profileHandle, cursor })
      .then(({ likes: newLikes, cursor: newCursor }) => {
        if (cursor) {
          setLikes([...likes, ...newLikes])
        } else {
          setLikes(newLikes)
        }
        setCursor(newCursor)
      })
      .catch((error) => {
        setLikes([])
        setCursor(undefined)
        setError(error.message)
      })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsLoading(true)
    load().then(() => {
      setIsLoading(false)
    })
  }

  useEffect(() => {
    if (!cursor) {
      return
    }

    let fetchingMore = false
    function onScroll() {
      if (!fetchingMore && document.body.scrollHeight - window.scrollY < 2000) {
        fetchingMore = true
        load(cursor)
        // The cursor will change and the effect will run again
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [cursor])

  return (
    <main>
      <h1 className="AppHeading">Show my likes! ❤️</h1>

      <p className="AppSubtitle">
        Enter your profile handle and get a list of posts you have liked
      </p>

      <form onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="profile-handle">Your profile handle</label>
          <input
            id="profile-handle"
            type="text"
            name="handle"
            placeholder="jesopo.bsky.social"
            value={profileHandle}
            onChange={(ev) => setProfileHandle(ev.target.value)}
          />
        </div>
      </form>

      <div
        className={cn('SpinnerCard', isLoading && 'SpinnerCard--visible')}
        aria-hidden={!isLoading}
      >
        <div className="SpinnerCard__inner">
          <i className="Spinner"></i>
          Loading your likes…
        </div>
      </div>

      {error ? (
        <FriendlyError
          className="LikeFetchError"
          heading="Error fetching likes"
          message={error}
        />
      ) : likes.length > 0 ? (
        <div
          className={cn('PostTimeline', isLoading && 'PostTimeline--loading')}
        >
          {likes.map((like) =>
            'value' in like ? (
              <Post key={like.uri} uri={like.uri} post={like.value} />
            ) : (
              <FriendlyError
                key={like.uri}
                heading="Error fetching the post"
                message={like.error}
              />
            )
          )}
          {cursor ? (
            <div className="PostSpinner" aria-label="Loading more posts">
              <i className="Spinner"></i>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

export default App
