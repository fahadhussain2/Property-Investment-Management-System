import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CopyIcon, UserPlusIcon, XIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Role } from '@/features/org/api'
import { useOrg } from '@/features/org/OrgProvider'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import {
  changeRole,
  fetchMembers,
  fetchPendingInvitations,
  inviteLink,
  inviteMember,
  memberKeys,
  removeMember,
  revokeInvitation,
} from './api'
import { inviteSchema, ROLES } from './schema'

async function copyLink(email: string) {
  try {
    await navigator.clipboard.writeText(inviteLink(email))
    toast.success('Invite link copied. Send it by WhatsApp or email.')
  } catch {
    toast.error('Could not copy. Select the link and copy it manually.')
  }
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { current } = useOrg()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [invited, setInvited] = useState<string | null>(null)
  const invite = useMutation({
    mutationFn: (v: { email: string; role: Role }) => inviteMember(current.id, v.email, v.role),
    onSuccess: (_d, v) => {
      setInvited(v.email)
      queryClient.invalidateQueries({ queryKey: memberKeys.invitations(current.id) })
    },
    onError: (e) => setErrors({ form: friendlyError(e) }),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(inviteSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setErrors({})
    invite.mutate(data)
  }

  function close(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setInvited(null)
      setErrors({})
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{invited ? 'Invitation created' : 'Invite a member'}</DialogTitle>
          <DialogDescription>
            {invited
              ? 'Send this link to them. They join as soon as they sign up with this email.'
              : 'They will join this business when they sign up with this email.'}
          </DialogDescription>
        </DialogHeader>
        {invited ? (
          <div className="grid gap-3">
            <code className="break-all rounded-md bg-muted p-3 text-xs" data-testid="invite-link">
              {inviteLink(invited)}
            </code>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Done
              </Button>
              <Button onClick={() => copyLink(invited)}>
                <CopyIcon /> Copy link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="off"
              error={errors.email}
            />
            <Field
              label="Role"
              name="role"
              error={errors.role}
              hint={ROLES.map((r) => `${r.label}: ${r.help}`).join(' · ')}
            >
              <NativeSelect id="field-role" name="role" defaultValue="accountant">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? 'Inviting…' : 'Create invitation'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MembersPage() {
  const { current, role } = useOrg()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const isOwner = role === 'owner'
  const [inviteOpen, setInviteOpen] = useState(false)

  const members = useQuery({
    queryKey: memberKeys.members(current.id),
    queryFn: () => fetchMembers(current.id),
  })
  const invitations = useQuery({
    queryKey: memberKeys.invitations(current.id),
    queryFn: () => fetchPendingInvitations(current.id),
    enabled: isOwner,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: memberKeys.members(current.id) })
    queryClient.invalidateQueries({ queryKey: memberKeys.invitations(current.id) })
    queryClient.invalidateQueries({ queryKey: ['my-orgs'] })
  }
  const onError = (e: Error) => toast.error(friendlyError(e))
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: Role }) => changeRole(current.id, v.userId, v.role),
    onSuccess: () => {
      toast.success('Role updated')
      refresh()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(current.id, userId),
    onSuccess: () => {
      toast.success('Member removed')
      refresh()
    },
    onError,
  })
  const revoke = useMutation({ mutationFn: revokeInvitation, onSuccess: refresh, onError })

  return (
    <>
      <PageHeader
        title="Members"
        description="People who can open this business's books"
        actions={
          isOwner && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlusIcon /> Invite
            </Button>
          )
        }
      />

      {members.isPending && <SectionLoading label="Loading members…" />}
      {members.isError && <SectionError error={members.error} onRetry={() => members.refetch()} />}
      {invitations.isError && (
        <SectionError error={invitations.error} onRetry={() => invitations.refetch()} />
      )}

      {members.isSuccess && (
        <ul className="divide-y rounded-lg border" data-testid="members-list">
          {members.data?.map((m) => {
            const isMe = m.user_id === session?.user.id
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.email} {isMe && <span className="text-muted-foreground">(you)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined {new Date(m.joined_at).toLocaleDateString()}
                  </div>
                </div>
                {isOwner ? (
                  <>
                    <NativeSelect
                      aria-label={`Role for ${m.email}`}
                      className="w-36"
                      value={m.role}
                      onChange={(e) =>
                        setRole.mutate({ userId: m.user_id, role: e.target.value as Role })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${m.email}`}
                      onClick={() => {
                        if (confirm(`Remove ${m.email} from ${current.name}?`))
                          remove.mutate(m.user_id)
                      }}
                    >
                      <XIcon />
                    </Button>
                  </>
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner && !!invitations.data?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Pending invitations</h2>
          <ul className="divide-y rounded-lg border" data-testid="invitations-list">
            {invitations.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 truncate text-sm">{i.email}</div>
                <Badge variant="outline" className="capitalize">
                  {i.role}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => copyLink(i.email)}>
                  <CopyIcon /> Link
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Revoke invitation for ${i.email}`}
                  onClick={() => revoke.mutate(i.id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
