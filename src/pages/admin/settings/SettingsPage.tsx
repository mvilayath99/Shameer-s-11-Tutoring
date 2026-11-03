import { useState } from 'react'
import { PageHeader } from '../../../components/PortalLayout'
import { Tabs } from '../../../components/ui'
import Branding from './Branding'
import Modules from './Modules'
import Content from './Content'
import Users from './Users'
import Integrations from './Integrations'
import Audit from './Audit'

const TABS = [
  { key: 'branding', label: 'Branding' },
  { key: 'modules', label: 'Modules' },
  { key: 'content', label: 'Website content' },
  { key: 'users', label: 'Users and roles' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'audit', label: 'Audit log' },
] as const
type Key = (typeof TABS)[number]['key']

export default function SettingsPage() {
  const [tab, setTab] = useState<Key>('branding')
  return (
    <>
      <PageHeader title="Site settings" subtitle="Only the super admin can see this area." />
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />
      {tab === 'branding' && <Branding />}
      {tab === 'modules' && <Modules />}
      {tab === 'content' && <Content />}
      {tab === 'users' && <Users />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'audit' && <Audit />}
    </>
  )
}
