# 003: Stable Site addresses

**Status:** Accepted; implemented in the current development baseline.

**Date:** 2026-11-16

**Plan:** [091 — Domain assignment and recorded command continuations](../archive/plans/091-plan-domain-assignment-and-command-continuations.md)

## Context

A Site's public hostname can be shared outside QRK. Deriving it from the current
username on every read would make those links change when the creator changes
their username. Address allocation must also prevent two Sites from claiming the
same hostname, even when they belong to different Users.

## Decision

Site creation records a request for Domains to reserve one complete hostname.
The hostname combines the saved QRK username with a six-character lowercase
alphanumeric suffix. Domains enforces unique hostname and Site identity; a
repeated assignment for the same Site and owner returns the existing hostname.
Domains records an external query of the Users Service and allocates from that retained username observation. The Domains external continuation records a command to apply the hostname on the User Aggregate; lookup and allocation failures become SiteFailure rows. A rename after the observation does not invalidate the resulting Site address.

Changing the username or unpublishing the Site does not change its address.
Address assignment does not publish the Site; publication state controls whether
Web serves its current Page snapshot.

The username ownership flow was simplified in [Plan 092](../archive/plans/092-plan-service-owned-usernames.md).

## Consequences and alternatives

Stable addresses preserve shared links, but a hostname's username prefix may no
longer match the creator's current username. Recomputing addresses from the
current username would keep the prefix current at the cost of breaking existing
links. Domains handles collisions and can reject an assignment when its bounded
candidate search is exhausted; a Site may therefore exist without an assigned
hostname.

## Source

1. [Domain model](../../apps/zerospin/src/services/domains/DomainV1.ts) and
   [assignment contract](../../apps/zerospin/src/services/domains/AssignDomainV1.ts).
2. [Site creation extension](../../apps/zerospin/src/fresh/contracts/CreateSiteExtensionV1.ts)
   and [assignment completion command](../../apps/zerospin/src/fresh/contracts/ApplyDomainAssignmentV1.ts).
3. [Site unpublish command](../../apps/zerospin/src/fresh/contracts/UnpublishSiteV1.ts)
   and [published-page reader](../../apps/web/library/readPublishedPage.ts).
