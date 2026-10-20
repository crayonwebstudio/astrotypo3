CREATE TABLE tx_astrobuilder_element (
  uid int(11) unsigned NOT NULL auto_increment,
  pid int(11) unsigned DEFAULT 0 NOT NULL,
  page_uid int(11) unsigned DEFAULT 0 NOT NULL,
  parent_uid int(11) unsigned DEFAULT 0 NOT NULL,
  element_id varchar(64) DEFAULT '' NOT NULL,
  component_id varchar(128) DEFAULT '' NOT NULL,
  tt_content_uid int(11) unsigned DEFAULT 0 NOT NULL,
  props text,
  sorting int(11) DEFAULT 0 NOT NULL,
  hidden tinyint(4) DEFAULT 0 NOT NULL,
  deleted tinyint(4) DEFAULT 0 NOT NULL,
  PRIMARY KEY (uid),
  KEY page_uid (page_uid)
);
CREATE TABLE tx_astrobuilder_element_type (
  uid int(11) unsigned NOT NULL auto_increment,
  pid int(11) unsigned DEFAULT 0 NOT NULL,
  crdate int(11) unsigned DEFAULT 0 NOT NULL,
  tstamp int(11) unsigned DEFAULT 0 NOT NULL,
  type_id varchar(128) DEFAULT '' NOT NULL,
  label varchar(255) DEFAULT '' NOT NULL,
  description text,
  fields text,
  hidden tinyint(4) DEFAULT 0 NOT NULL,
  deleted tinyint(4) DEFAULT 0 NOT NULL,
  PRIMARY KEY (uid),
  KEY type_id (type_id)
);
CREATE TABLE tx_astrobuilder_audit (
  uid int(11) unsigned NOT NULL auto_increment,
  pid int(11) unsigned DEFAULT 0 NOT NULL,
  crdate int(11) unsigned DEFAULT 0 NOT NULL,
  be_user int(11) unsigned DEFAULT 0 NOT NULL,
  action varchar(64) DEFAULT '' NOT NULL,
  page_uid int(11) unsigned DEFAULT 0 NOT NULL,
  summary text,
  details text,
  PRIMARY KEY (uid)
);
CREATE TABLE tx_astrobuilder_ai_usage (
  uid int(11) unsigned NOT NULL auto_increment,
  pid int(11) unsigned DEFAULT 0 NOT NULL,
  crdate int(11) unsigned DEFAULT 0 NOT NULL,
  be_user int(11) unsigned DEFAULT 0 NOT NULL,
  provider varchar(64) DEFAULT '' NOT NULL,
  model varchar(128) DEFAULT '' NOT NULL,
  prompt_tokens int(11) DEFAULT 0 NOT NULL,
  completion_tokens int(11) DEFAULT 0 NOT NULL,
  status varchar(32) DEFAULT '' NOT NULL,
  PRIMARY KEY (uid)
);
