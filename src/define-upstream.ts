// Registers the upstream @civitai/components elements this app renders
// directly: the slide-out sidebar's navigation (civitai-nav-list /
// civitai-nav-item). Each /define module is the package's own idempotent
// registrar. Imported for side effects by components/SideNav.tsx, the one
// surface that renders them.
import '@civitai/components/civitai-nav-list/define';
import '@civitai/components/civitai-nav-item/define';
