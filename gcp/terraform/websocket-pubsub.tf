# Pub/Sub configuration for WebSocket message distribution
# Handles real-time events across multiple Cloud Run instances

# Topic for tender-related events
resource "google_pubsub_topic" "tender_events" {
  name = "tender-events"
  
  # Message retention for reliability
  message_retention_duration = "86400s"  # 24 hours
  
  # Schema enforcement for message validation
  schema_settings {
    schema   = google_pubsub_schema.tender_event_schema.id
    encoding = "JSON"
  }
  
  labels = {
    environment = var.environment
    service     = "websocket"
    domain      = "tender"
  }
}

# Topic for document events
resource "google_pubsub_topic" "document_events" {
  name = "document-events"
  
  message_retention_duration = "86400s"
  
  schema_settings {
    schema   = google_pubsub_schema.document_event_schema.id
    encoding = "JSON"
  }
  
  labels = {
    environment = var.environment
    service     = "websocket"
    domain      = "document"
  }
}

# Topic for collaboration events (comments, assignments)
resource "google_pubsub_topic" "collaboration_events" {
  name = "collaboration-events"
  
  message_retention_duration = "86400s"
  
  schema_settings {
    schema   = google_pubsub_schema.collaboration_event_schema.id
    encoding = "JSON"
  }
  
  labels = {
    environment = var.environment
    service     = "websocket"
    domain      = "collaboration"
  }
}

# Topic for notifications
resource "google_pubsub_topic" "notification_events" {
  name = "notification-events"
  
  message_retention_duration = "604800s"  # 7 days for notifications
  
  schema_settings {
    schema   = google_pubsub_schema.notification_event_schema.id
    encoding = "JSON"
  }
  
  labels = {
    environment = var.environment
    service     = "websocket"
    domain      = "notification"
  }
}

# Topic for user presence events
resource "google_pubsub_topic" "presence_events" {
  name = "presence-events"
  
  message_retention_duration = "3600s"  # 1 hour for presence
  
  schema_settings {
    schema   = google_pubsub_schema.presence_event_schema.id
    encoding = "JSON"
  }
  
  labels = {
    environment = var.environment
    service     = "websocket"
    domain      = "presence"
  }
}

# Dead letter topic for failed messages
resource "google_pubsub_topic" "websocket_dead_letters" {
  name = "websocket-dead-letters"
  
  message_retention_duration = "604800s"  # 7 days
  
  labels = {
    environment = var.environment
    service     = "websocket"
    type        = "dead-letter"
  }
}

# Schemas for message validation
resource "google_pubsub_schema" "tender_event_schema" {
  name = "tender-event-schema"
  type = "AVRO"
  
  definition = jsonencode({
    type = "record"
    name = "TenderEvent"
    fields = [
      {
        name = "eventType"
        type = {
          type = "enum"
          name = "TenderEventType"
          symbols = ["CREATED", "UPDATED", "DELETED", "STATE_CHANGED", "DEADLINE_APPROACHING"]
        }
      },
      {
        name = "tenderId"
        type = "string"
      },
      {
        name = "tenantId"
        type = "string"
      },
      {
        name = "userId"
        type = "string"
      },
      {
        name = "timestamp"
        type = "long"
        logicalType = "timestamp-millis"
      },
      {
        name = "data"
        type = ["null", {
          type = "record"
          name = "TenderData"
          fields = [
            { name = "title", type = ["null", "string"], default = null },
            { name = "status", type = ["null", "string"], default = null },
            { name = "deadline", type = ["null", "long"], default = null },
            { name = "changes", type = ["null", "string"], default = null }
          ]
        }]
        default = null
      }
    ]
  })
}

resource "google_pubsub_schema" "document_event_schema" {
  name = "document-event-schema"
  type = "AVRO"
  
  definition = jsonencode({
    type = "record"
    name = "DocumentEvent"
    fields = [
      {
        name = "eventType"
        type = {
          type = "enum"
          name = "DocumentEventType"
          symbols = ["UPLOADED", "PROCESSED", "DELETED", "OCR_COMPLETED", "VIRUS_SCAN_COMPLETED"]
        }
      },
      {
        name = "documentId"
        type = "string"
      },
      {
        name = "tenderId"
        type = "string"
      },
      {
        name = "tenantId"
        type = "string"
      },
      {
        name = "userId"
        type = "string"
      },
      {
        name = "timestamp"
        type = "long"
        logicalType = "timestamp-millis"
      },
      {
        name = "data"
        type = ["null", {
          type = "record"
          name = "DocumentData"
          fields = [
            { name = "filename", type = ["null", "string"], default = null },
            { name = "mimeType", type = ["null", "string"], default = null },
            { name = "size", type = ["null", "long"], default = null },
            { name = "status", type = ["null", "string"], default = null }
          ]
        }]
        default = null
      }
    ]
  })
}

resource "google_pubsub_schema" "collaboration_event_schema" {
  name = "collaboration-event-schema"
  type = "AVRO"
  
  definition = jsonencode({
    type = "record"
    name = "CollaborationEvent"
    fields = [
      {
        name = "eventType"
        type = {
          type = "enum"
          name = "CollaborationEventType"
          symbols = ["COMMENT_ADDED", "COMMENT_UPDATED", "COMMENT_DELETED", "USER_ASSIGNED", "USER_UNASSIGNED"]
        }
      },
      {
        name = "resourceId"
        type = "string"
      },
      {
        name = "resourceType"
        type = {
          type = "enum"
          name = "ResourceType"
          symbols = ["TENDER", "DOCUMENT", "BID"]
        }
      },
      {
        name = "tenantId"
        type = "string"
      },
      {
        name = "userId"
        type = "string"
      },
      {
        name = "timestamp"
        type = "long"
        logicalType = "timestamp-millis"
      },
      {
        name = "data"
        type = ["null", "string"]
        default = null
      }
    ]
  })
}

resource "google_pubsub_schema" "notification_event_schema" {
  name = "notification-event-schema"
  type = "AVRO"
  
  definition = jsonencode({
    type = "record"
    name = "NotificationEvent"
    fields = [
      {
        name = "notificationId"
        type = "string"
      },
      {
        name = "recipientId"
        type = "string"
      },
      {
        name = "tenantId"
        type = "string"
      },
      {
        name = "type"
        type = {
          type = "enum"
          name = "NotificationType"
          symbols = ["TENDER_DEADLINE", "NEW_COMMENT", "DOCUMENT_PROCESSED", "USER_ASSIGNED", "SYSTEM_ALERT"]
        }
      },
      {
        name = "priority"
        type = {
          type = "enum"
          name = "Priority"
          symbols = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        }
        default = "MEDIUM"
      },
      {
        name = "title"
        type = "string"
      },
      {
        name = "message"
        type = "string"
      },
      {
        name = "timestamp"
        type = "long"
        logicalType = "timestamp-millis"
      },
      {
        name = "data"
        type = ["null", "string"]
        default = null
      }
    ]
  })
}

resource "google_pubsub_schema" "presence_event_schema" {
  name = "presence-event-schema"
  type = "AVRO"
  
  definition = jsonencode({
    type = "record"
    name = "PresenceEvent"
    fields = [
      {
        name = "userId"
        type = "string"
      },
      {
        name = "tenantId"
        type = "string"
      },
      {
        name = "status"
        type = {
          type = "enum"
          name = "PresenceStatus"
          symbols = ["ONLINE", "OFFLINE", "AWAY", "BUSY"]
        }
      },
      {
        name = "location"
        type = ["null", {
          type = "record"
          name = "Location"
          fields = [
            { name = "page", type = "string" },
            { name = "tenderId", type = ["null", "string"], default = null },
            { name = "documentId", type = ["null", "string"], default = null }
          ]
        }]
        default = null
      },
      {
        name = "timestamp"
        type = "long"
        logicalType = "timestamp-millis"
      }
    ]
  })
}

# Subscriptions for WebSocket service instances
resource "google_pubsub_subscription" "websocket_tender_events" {
  name  = "websocket-tender-events-sub"
  topic = google_pubsub_topic.tender_events.name
  
  # Push delivery to Cloud Run WebSocket service
  push_config {
    push_endpoint = "${var.websocket_service_url}/pubsub/tender-events"
    
    # Authentication for push endpoint
    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience             = var.websocket_service_url
    }
  }
  
  # Message retention and acknowledgment
  message_retention_duration = "600s"  # 10 minutes
  ack_deadline_seconds      = 20
  
  # Dead letter policy
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.websocket_dead_letters.id
    max_delivery_attempts = 5
  }
  
  # Retry policy
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  
  # Filter for tenant isolation
  filter = "attributes.tenantId != \"\""
}

resource "google_pubsub_subscription" "websocket_document_events" {
  name  = "websocket-document-events-sub"
  topic = google_pubsub_topic.document_events.name
  
  push_config {
    push_endpoint = "${var.websocket_service_url}/pubsub/document-events"
    
    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience             = var.websocket_service_url
    }
  }
  
  message_retention_duration = "600s"
  ack_deadline_seconds      = 20
  
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.websocket_dead_letters.id
    max_delivery_attempts = 5
  }
  
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_subscription" "websocket_collaboration_events" {
  name  = "websocket-collaboration-events-sub"
  topic = google_pubsub_topic.collaboration_events.name
  
  push_config {
    push_endpoint = "${var.websocket_service_url}/pubsub/collaboration-events"
    
    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience             = var.websocket_service_url
    }
  }
  
  message_retention_duration = "600s"
  ack_deadline_seconds      = 20
  
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.websocket_dead_letters.id
    max_delivery_attempts = 5
  }
}

resource "google_pubsub_subscription" "websocket_notification_events" {
  name  = "websocket-notification-events-sub"
  topic = google_pubsub_topic.notification_events.name
  
  push_config {
    push_endpoint = "${var.websocket_service_url}/pubsub/notification-events"
    
    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience             = var.websocket_service_url
    }
  }
  
  message_retention_duration = "1200s"  # 20 minutes for notifications
  ack_deadline_seconds      = 30
  
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.websocket_dead_letters.id
    max_delivery_attempts = 3
  }
}

resource "google_pubsub_subscription" "websocket_presence_events" {
  name  = "websocket-presence-events-sub"
  topic = google_pubsub_topic.presence_events.name
  
  push_config {
    push_endpoint = "${var.websocket_service_url}/pubsub/presence-events"
    
    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience             = var.websocket_service_url
    }
  }
  
  message_retention_duration = "300s"  # 5 minutes for presence
  ack_deadline_seconds      = 10
  
  # No dead letter for presence events - they're ephemeral
  
  # Exponential backoff for presence events
  retry_policy {
    minimum_backoff = "1s"
    maximum_backoff = "10s"
  }
}

# Service account for Pub/Sub push authentication
resource "google_service_account" "pubsub_pusher" {
  account_id   = "pubsub-websocket-pusher"
  display_name = "Pub/Sub WebSocket Pusher"
  description  = "Service account for pushing Pub/Sub messages to WebSocket service"
}

resource "google_project_iam_member" "pubsub_pusher_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.pubsub_pusher.email}"
}

# Service account for WebSocket service Pub/Sub publishing
resource "google_service_account" "websocket_publisher" {
  account_id   = "websocket-pubsub-publisher"
  display_name = "WebSocket Pub/Sub Publisher"
  description  = "Service account for WebSocket service to publish events"
}

resource "google_project_iam_member" "websocket_publisher_role" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.websocket_publisher.email}"
}

# Monitoring for Pub/Sub
resource "google_monitoring_alert_policy" "pubsub_message_backlog" {
  display_name = "Pub/Sub Message Backlog Alert"
  
  conditions {
    display_name = "High message backlog in WebSocket subscriptions"
    
    condition_threshold {
      filter          = "resource.type=\"pubsub_subscription\" AND resource.label.subscription_id=~\"websocket-.*\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 1000
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Outputs
output "pubsub_topics" {
  description = "Created Pub/Sub topics"
  value = {
    tender_events        = google_pubsub_topic.tender_events.name
    document_events      = google_pubsub_topic.document_events.name
    collaboration_events = google_pubsub_topic.collaboration_events.name
    notification_events  = google_pubsub_topic.notification_events.name
    presence_events      = google_pubsub_topic.presence_events.name
    dead_letters         = google_pubsub_topic.websocket_dead_letters.name
  }
}

output "pubsub_service_accounts" {
  description = "Service accounts for Pub/Sub operations"
  value = {
    pusher    = google_service_account.pubsub_pusher.email
    publisher = google_service_account.websocket_publisher.email
  }
}